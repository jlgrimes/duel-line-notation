#include <cstdint>
#include <unordered_map>

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
};

std::unordered_map<uint32_t, DuelSlot> duels;
std::unordered_map<uint32_t, CardRecord> card_records;
uint32_t next_handle = 1;

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

int read_script(void*, OCG_Duel, const char*) {
  return 0;
}

void log_message(void*, const char*, int) {}

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

  CardRecord record{};
  record.data.code = code;
  record.data.alias = alias;
  record.data.setcodes = nullptr;
  record.data.type = type;
  record.data.level = level;
  record.data.attribute = attribute;
  record.data.race = combine_u64(race_low, race_high);
  record.data.attack = attack;
  record.data.defense = defense;
  record.data.lscale = lscale;
  record.data.rscale = rscale;
  record.data.link_marker = link_marker;
  card_records.insert_or_assign(code, record);
  return 1;
}

DLN_EXPORT void dln_ocg_clear_card_data() {
  card_records.clear();
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
