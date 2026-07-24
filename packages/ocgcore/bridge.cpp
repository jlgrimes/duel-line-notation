#include <cstdint>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>

#include "ocgapi.h"

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define DLN_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define DLN_EXPORT extern "C"
#endif

namespace {

struct DuelSlot {
  OCG_Duel duel = nullptr;
};

struct CardRecord {
  OCG_CardData data{};
  // Owns the storage `data.setcodes` points at. The core copies the values out during
  // read_card and terminates on a zero entry, so this must stay zero-terminated.
  std::vector<uint16_t> setcodes;
};

std::unordered_map<uint32_t, DuelSlot> duels;
std::unordered_map<uint32_t, CardRecord> card_records;
uint32_t next_handle = 1;

// Lua sources keyed by the exact name the core asks for, such as "c15025844.lua".
// The host owns every script: the WebAssembly build has no filesystem.
std::unordered_map<std::string, std::string> scripts;

// Bounded so a duel that requests scripts in a loop cannot exhaust memory. Reading a log
// clears it, so a caller that drains after each step never hits the cap.
constexpr size_t LOG_ENTRY_LIMIT = 512;

std::vector<std::string> script_log;
std::vector<std::string> engine_log;
std::string log_buffer;

void record(std::vector<std::string>& log, std::string entry) {
  if(log.size() >= LOG_ENTRY_LIMIT) {
    return;
  }
  log.push_back(std::move(entry));
}

uint64_t combine_u64(uint32_t low, uint32_t high) {
  return static_cast<uint64_t>(low) | (static_cast<uint64_t>(high) << 32U);
}

uint64_t splitmix64(uint64_t& state) {
  uint64_t value = (state += 0x9E3779B97F4A7C15ULL);
  value = (value ^ (value >> 30U)) * 0xBF58476D1CE4E5B9ULL;
  value = (value ^ (value >> 27U)) * 0x94D049BB133111EBULL;
  return value ^ (value >> 31U);
}

void read_card(void*, uint32_t code, OCG_CardData* data) {
  if(data == nullptr) {
    return;
  }

  const auto iterator = card_records.find(code);
  if(iterator != card_records.end()) {
    *data = iterator->second.data;
    return;
  }

  *data = {};
  data->code = code;
}

void card_reader_done(void*, OCG_CardData*) {}

// Resolves a script the core asked for and hands it to the interpreter, which both
// compiles and runs it. Every lookup is recorded so a caller can tell a missing script
// apart from one that failed to compile.
//
// The log is faithful, not filtered: creating a duel makes the core probe "c0.lua" for
// its internal temporary card, so a "MISS c0.lua" entry is normal and expected. Register
// an empty script under that name to silence it.
int read_script(void*, OCG_Duel duel, const char* name) {
  if(name == nullptr || duel == nullptr) {
    return 0;
  }

  const std::string key(name);
  const auto iterator = scripts.find(key);
  if(iterator == scripts.end()) {
    record(script_log, "MISS " + key);
    return 0;
  }

  const std::string& source = iterator->second;
  const int status = OCG_LoadScript(duel, source.data(), static_cast<uint32_t>(source.size()), name);
  record(script_log, (status != 0 ? "OK " : "FAIL ") + key);
  return status;
}

// Lua compile and runtime errors arrive here. Without this they are silently discarded,
// which makes a broken script indistinguishable from a missing one.
void log_message(void*, const char* message, int type) {
  if(message == nullptr) {
    return;
  }
  record(engine_log, std::to_string(type) + " " + std::string(message));
}

DuelSlot* find_duel(uint32_t handle) {
  const auto iterator = duels.find(handle);
  return iterator == duels.end() ? nullptr : &iterator->second;
}

uintptr_t query_result(void* buffer, uint32_t buffer_length, uint32_t* length) {
  if(length != nullptr) {
    *length = buffer_length;
  }
  return reinterpret_cast<uintptr_t>(buffer);
}

// Drains a log into a newline-delimited buffer. The buffer stays valid until the next
// call, matching how the core's own query buffers behave.
uintptr_t take_log(std::vector<std::string>& log, uint32_t* length) {
  log_buffer.clear();
  for(const auto& entry : log) {
    log_buffer.append(entry);
    log_buffer.push_back('\n');
  }
  log.clear();

  if(log_buffer.empty()) {
    if(length != nullptr) {
      *length = 0;
    }
    return 0;
  }
  return query_result(&log_buffer[0], static_cast<uint32_t>(log_buffer.size()), length);
}

} // namespace

DLN_EXPORT int dln_ocg_version_major() {
  int major = 0;
  OCG_GetVersion(&major, nullptr);
  return major;
}

DLN_EXPORT int dln_ocg_version_minor() {
  int minor = 0;
  OCG_GetVersion(nullptr, &minor);
  return minor;
}

DLN_EXPORT int dln_ocg_set_card_data(
  uint32_t code,
  uint32_t alias,
  uint32_t type,
  uint32_t level,
  uint32_t attribute,
  uint32_t race_low,
  uint32_t race_high,
  int32_t attack,
  int32_t defense,
  uint32_t lscale,
  uint32_t rscale,
  uint32_t link_marker
) {
  if(code == 0) {
    return 0;
  }

  CardRecord entry{};
  entry.data.code = code;
  entry.data.alias = alias;
  entry.data.setcodes = nullptr;
  entry.data.type = type;
  entry.data.level = level;
  entry.data.attribute = attribute;
  entry.data.race = combine_u64(race_low, race_high);
  entry.data.attack = attack;
  entry.data.defense = defense;
  entry.data.lscale = lscale;
  entry.data.rscale = rscale;
  entry.data.link_marker = link_marker;

  // Replacing a record drops its set codes; call dln_ocg_set_card_setcodes afterwards.
  card_records[code] = std::move(entry);
  return 1;
}

// Archetype membership, which the core reads separately from the fixed card fields.
// Values are copied, zero-terminated, and owned by the record they belong to.
DLN_EXPORT int dln_ocg_set_card_setcodes(uint32_t code, const uint16_t* values, uint32_t count) {
  const auto iterator = card_records.find(code);
  if(iterator == card_records.end()) {
    return 0;
  }

  CardRecord& entry = iterator->second;
  entry.setcodes.clear();
  if(values != nullptr) {
    for(uint32_t index = 0; index < count; ++index) {
      uint16_t value = 0;
      std::memcpy(&value, values + index, sizeof(uint16_t));
      if(value != 0) {
        entry.setcodes.push_back(value);
      }
    }
  }

  if(entry.setcodes.empty()) {
    entry.data.setcodes = nullptr;
    return 1;
  }

  entry.setcodes.push_back(0);
  entry.data.setcodes = entry.setcodes.data();
  return 1;
}

DLN_EXPORT void dln_ocg_clear_card_data() {
  card_records.clear();
}

// Registers one Lua source. Name and data are passed as pointer plus length so the caller
// never has to worry about embedded NULs or JavaScript string encoding.
DLN_EXPORT int dln_ocg_set_script(
  const char* name,
  uint32_t name_length,
  const char* data,
  uint32_t data_length
) {
  if(name == nullptr || name_length == 0 || (data == nullptr && data_length > 0)) {
    return 0;
  }
  scripts.insert_or_assign(std::string(name, name_length), std::string(data, data_length));
  return 1;
}

DLN_EXPORT void dln_ocg_clear_scripts() {
  scripts.clear();
  script_log.clear();
}

DLN_EXPORT uint32_t dln_ocg_script_count() {
  return static_cast<uint32_t>(scripts.size());
}

// Loads a registered script into a duel up front. The core resolves card scripts on
// demand, but shared libraries such as constant.lua and utility.lua have to be pushed in
// before the scripts that expect them run.
DLN_EXPORT int dln_ocg_load_script(uint32_t handle, const char* name, uint32_t name_length) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr || name == nullptr || name_length == 0) {
    return 0;
  }
  const std::string key(name, name_length);
  return read_script(nullptr, slot->duel, key.c_str());
}

DLN_EXPORT uintptr_t dln_ocg_take_script_log(uint32_t* length) {
  return take_log(script_log, length);
}

DLN_EXPORT uintptr_t dln_ocg_take_engine_log(uint32_t* length) {
  return take_log(engine_log, length);
}

DLN_EXPORT uint32_t dln_ocg_create(
  uint32_t seed_low,
  uint32_t seed_high,
  uint32_t flags_low,
  uint32_t flags_high,
  uint32_t starting_lp,
  uint32_t starting_draw_count,
  uint32_t draw_count_per_turn
) {
  OCG_DuelOptions options{};

  uint64_t seed_state = combine_u64(seed_low, seed_high);
  if(seed_state == 0) {
    seed_state = 0x444C4E2D4F434743ULL;
  }
  for(auto& seed : options.seed) {
    seed = splitmix64(seed_state);
  }

  options.flags = combine_u64(flags_low, flags_high);
  options.team1 = {starting_lp, starting_draw_count, draw_count_per_turn};
  options.team2 = {starting_lp, starting_draw_count, draw_count_per_turn};
  options.cardReader = read_card;
  options.payload1 = nullptr;
  options.scriptReader = read_script;
  options.payload2 = nullptr;
  options.logHandler = log_message;
  options.payload3 = nullptr;
  options.cardReaderDone = card_reader_done;
  options.payload4 = nullptr;
  options.enableUnsafeLibraries = 0;

  OCG_Duel duel = nullptr;
  const int status = OCG_CreateDuel(&duel, &options);
  if(status != OCG_DUEL_CREATION_SUCCESS || duel == nullptr) {
    return 0;
  }

  uint32_t handle = next_handle++;
  if(handle == 0) {
    handle = next_handle++;
  }
  duels.emplace(handle, DuelSlot{duel});
  return handle;
}

DLN_EXPORT int dln_ocg_destroy(uint32_t handle) {
  const auto iterator = duels.find(handle);
  if(iterator == duels.end()) {
    return 0;
  }
  OCG_DestroyDuel(iterator->second.duel);
  duels.erase(iterator);
  return 1;
}

DLN_EXPORT int dln_ocg_new_card(
  uint32_t handle,
  uint32_t team,
  uint32_t duelist,
  uint32_t code,
  uint32_t controller,
  uint32_t location,
  uint32_t sequence,
  uint32_t position
) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr || team > 1 || controller > 1 || duelist > 255) {
    return 0;
  }

  OCG_NewCardInfo info{};
  info.team = static_cast<uint8_t>(team);
  info.duelist = static_cast<uint8_t>(duelist);
  info.code = code;
  info.con = static_cast<uint8_t>(controller);
  info.loc = location;
  info.seq = sequence;
  info.pos = position;
  OCG_DuelNewCard(slot->duel, &info);
  return 1;
}

DLN_EXPORT int dln_ocg_start(uint32_t handle) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr) {
    return 0;
  }
  OCG_StartDuel(slot->duel);
  return 1;
}

DLN_EXPORT int dln_ocg_process(uint32_t handle) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr) {
    return -1;
  }
  return OCG_DuelProcess(slot->duel);
}

DLN_EXPORT uintptr_t dln_ocg_get_message(uint32_t handle, uint32_t* length) {
  if(length != nullptr) {
    *length = 0;
  }

  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr) {
    return 0;
  }

  uint32_t message_length = 0;
  void* message = OCG_DuelGetMessage(slot->duel, &message_length);
  return query_result(message, message_length, length);
}

DLN_EXPORT int dln_ocg_set_response(uint32_t handle, const uint8_t* response, uint32_t length) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr || (length > 0 && response == nullptr)) {
    return 0;
  }
  OCG_DuelSetResponse(slot->duel, response, length);
  return 1;
}

DLN_EXPORT uint32_t dln_ocg_query_count(uint32_t handle, uint32_t team, uint32_t location) {
  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr || team > 1) {
    return 0;
  }
  return OCG_DuelQueryCount(slot->duel, static_cast<uint8_t>(team), location);
}

DLN_EXPORT uintptr_t dln_ocg_query_card(
  uint32_t handle,
  uint32_t flags,
  uint32_t controller,
  uint32_t location,
  uint32_t sequence,
  uint32_t overlay_sequence,
  uint32_t* length
) {
  if(length != nullptr) {
    *length = 0;
  }

  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr || controller > 1) {
    return 0;
  }

  OCG_QueryInfo info{};
  info.flags = flags;
  info.con = static_cast<uint8_t>(controller);
  info.loc = location;
  info.seq = sequence;
  info.overlay_seq = overlay_sequence;

  uint32_t query_length = 0;
  void* query = OCG_DuelQuery(slot->duel, &query_length, &info);
  return query_result(query, query_length, length);
}

DLN_EXPORT uintptr_t dln_ocg_query_field(uint32_t handle, uint32_t* length) {
  if(length != nullptr) {
    *length = 0;
  }

  DuelSlot* slot = find_duel(handle);
  if(slot == nullptr) {
    return 0;
  }

  uint32_t query_length = 0;
  void* query = OCG_DuelQueryField(slot->duel, &query_length);
  return query_result(query, query_length, length);
}
