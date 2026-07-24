// Native harness for the DLN bridge. Emscripten is not available here, so this compiles
// the pinned core, Lua, and bridge.cpp for the host and exercises the new script-resolver
// exports directly. It mirrors what packages/ocgcore/scripts/smoke.mjs asserts in CI.

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

extern "C" {
int dln_ocg_version_major();
int dln_ocg_version_minor();
int dln_ocg_set_card_data(uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t,
                          uint32_t, int32_t, int32_t, uint32_t, uint32_t, uint32_t);
int dln_ocg_set_card_setcodes(uint32_t code, const uint16_t* values, uint32_t count);
void dln_ocg_clear_card_data();
int dln_ocg_set_script(const char* name, uint32_t name_length, const char* data, uint32_t data_length);
void dln_ocg_clear_scripts();
uint32_t dln_ocg_script_count();
int dln_ocg_load_script(uint32_t handle, const char* name, uint32_t name_length);
uintptr_t dln_ocg_take_script_log(uint32_t* length);
uintptr_t dln_ocg_take_engine_log(uint32_t* length);
uint32_t dln_ocg_create(uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t);
int dln_ocg_destroy(uint32_t handle);
int dln_ocg_new_card(uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t);
int dln_ocg_start(uint32_t handle);
int dln_ocg_process(uint32_t handle);
uintptr_t dln_ocg_query_card(uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t*);
}

static int failures = 0;

static void check(bool condition, const char* what) {
  std::printf("%s %s\n", condition ? "ok  " : "FAIL", what);
  if (!condition) failures += 1;
}

static std::string take(uintptr_t (*reader)(uint32_t*)) {
  uint32_t length = 0;
  const uintptr_t pointer = reader(&length);
  if (pointer == 0 || length == 0) return {};
  return std::string(reinterpret_cast<const char*>(pointer), length);
}

static int load(uint32_t handle, const char* name) {
  return dln_ocg_load_script(handle, name, static_cast<uint32_t>(std::strlen(name)));
}

static int put(const char* name, const char* source) {
  return dln_ocg_set_script(name, static_cast<uint32_t>(std::strlen(name)),
                            source, static_cast<uint32_t>(std::strlen(source)));
}

// ---------------------------------------------------------------------------------------
// Optional second stage: drive a real card bundle through the real core.
//
// Given the fixture directory written by packages/carddata (`dist/<slug>.native`), this
// registers the real records and real Lua scripts and starts a duel with them. It is the
// only way to know that scripted cards work before a WebAssembly build exists.
// ---------------------------------------------------------------------------------------

static std::string readFile(const std::string& path) {
  std::FILE* handle = std::fopen(path.c_str(), "rb");
  if (handle == nullptr) return {};
  std::string contents;
  char chunk[8192];
  size_t read = 0;
  while ((read = std::fread(chunk, 1, sizeof(chunk), handle)) > 0) contents.append(chunk, read);
  std::fclose(handle);
  return contents;
}

static std::vector<std::string> split(const std::string& text, char separator) {
  std::vector<std::string> parts;
  size_t start = 0;
  while (start <= text.size()) {
    const size_t end = text.find(separator, start);
    if (end == std::string::npos) {
      parts.push_back(text.substr(start));
      break;
    }
    parts.push_back(text.substr(start, end - start));
    start = end + 1;
  }
  return parts;
}

static bool registerBundle(const std::string& root, std::vector<uint32_t>& codes) {
  const std::string table = readFile(root + "/cards.tsv");
  if (table.empty()) {
    std::printf("FAIL could not read %s/cards.tsv\n", root.c_str());
    return false;
  }

  for (const std::string& line : split(table, '\n')) {
    if (line.empty()) continue;
    const std::vector<std::string> field = split(line, '\t');
    if (field.size() < 12) {
      std::printf("FAIL malformed card row: %s\n", line.c_str());
      return false;
    }

    const uint32_t code = static_cast<uint32_t>(std::stoul(field[0]));
    const uint64_t race = std::stoull(field[5]);
    if (dln_ocg_set_card_data(code,
                              static_cast<uint32_t>(std::stoul(field[1])),
                              static_cast<uint32_t>(std::stoul(field[2])),
                              static_cast<uint32_t>(std::stoul(field[3])),
                              static_cast<uint32_t>(std::stoul(field[4])),
                              static_cast<uint32_t>(race & 0xffffffffu),
                              static_cast<uint32_t>(race >> 32),
                              std::stoi(field[6]), std::stoi(field[7]),
                              static_cast<uint32_t>(std::stoul(field[8])),
                              static_cast<uint32_t>(std::stoul(field[9])),
                              static_cast<uint32_t>(std::stoul(field[10]))) != 1) {
      std::printf("FAIL could not register card %u\n", code);
      return false;
    }

    std::vector<uint16_t> setcodes;
    for (const std::string& value : split(field[11], ',')) {
      if (!value.empty()) setcodes.push_back(static_cast<uint16_t>(std::stoul(value)));
    }
    if (!setcodes.empty()
        && dln_ocg_set_card_setcodes(code, setcodes.data(), static_cast<uint32_t>(setcodes.size())) != 1) {
      std::printf("FAIL could not register set codes for %u\n", code);
      return false;
    }

    codes.push_back(code);
  }

  // Every script the bundle carries, named by its manifest: the shared library layer as
  // well as the per-card scripts.
  const std::string manifest = readFile(root + "/scripts.txt");
  if (manifest.empty()) {
    std::printf("FAIL could not read %s/scripts.txt\n", root.c_str());
    return false;
  }
  size_t registered = 0;
  for (const std::string& name : split(manifest, '\n')) {
    if (name.empty()) continue;
    const std::string source = readFile(root + "/" + name);
    if (source.empty()) {
      std::printf("FAIL missing script %s\n", name.c_str());
      return false;
    }
    dln_ocg_set_script(name.data(), static_cast<uint32_t>(name.size()),
                       source.data(), static_cast<uint32_t>(source.size()));
    registered += 1;
  }
  std::printf("     registered %zu scripts for %zu cards\n", registered, codes.size());
  return true;
}

static void checkRealBundle(const std::string& root) {
  std::printf("\n-- real card bundle: %s\n", root.c_str());
  dln_ocg_clear_card_data();
  dln_ocg_clear_scripts();

  std::vector<uint32_t> codes;
  if (!registerBundle(root, codes)) {
    failures += 1;
    return;
  }
  check(!codes.empty(), "bundle declares cards");

  const uint32_t handle = dln_ocg_create(0x12345678, 0x9abcdef0, 0, 0, 8000, 5, 1);
  check(handle > 0, "duel allocates for the real bundle");

  // Shared libraries are not requested by the core; the host pushes them in first.
  check(load(handle, "constant.lua") == 1, "constant.lua loads");
  check(load(handle, "utility.lua") == 1, "utility.lua loads");

  // Adding a card makes the core resolve and run that card's script.
  for (size_t index = 0; index < codes.size(); ++index) {
    dln_ocg_new_card(handle, 0, 0, codes[index], 0, 0x01 /* LOCATION_DECK */, 0, 0x08);
    dln_ocg_new_card(handle, 1, 0, codes[index], 1, 0x01, 0, 0x08);
  }

  // Every card script must resolve. A missing shared library is only reported: the script
  // collection probes for optional libraries such as proc_unofficial.lua that it does not
  // ship, and those misses are expected.
  const std::string registration = take(dln_ocg_take_script_log);
  size_t cardScripts = 0;
  size_t compileFailures = 0;
  size_t optionalMisses = 0;
  for (const std::string& entry : split(registration, '\n')) {
    if (entry.empty()) continue;
    const bool isCardScript = entry.find(" c") != std::string::npos
      && entry.find(".lua") != std::string::npos
      && entry.find("_") == std::string::npos;
    if (entry.rfind("OK ", 0) == 0 && isCardScript) cardScripts += 1;
    if (entry.rfind("FAIL ", 0) == 0) {
      compileFailures += 1;
      std::printf("     failed to compile: %s\n", entry.c_str());
    }
    if (entry.rfind("MISS ", 0) == 0) {
      optionalMisses += 1;
      if (isCardScript) {
        std::printf("     card script never resolved: %s\n", entry.c_str());
        compileFailures += 1;
      }
    }
  }
  std::printf("     %zu card scripts compiled and ran, %zu optional libraries absent\n",
              cardScripts, optionalMisses);
  check(cardScripts >= codes.size(), "every card script compiled and ran");
  check(compileFailures == 0, "no script failed to compile");

  check(dln_ocg_start(handle) == 1, "duel starts with scripted cards");
  int status = 2;
  for (int step = 0; step < 64 && status == 2; ++step) status = dln_ocg_process(handle);
  check(status == 0 || status == 1, "the core processes a duel of scripted cards");

  const std::string errors = take(dln_ocg_take_engine_log);
  if (!errors.empty()) std::printf("     engine log:\n%s", errors.c_str());
  check(errors.empty(), "no Lua errors were raised");

  dln_ocg_destroy(handle);
  dln_ocg_clear_scripts();
  dln_ocg_clear_card_data();
}

int main(int argc, char** argv) {
  check(dln_ocg_version_major() == 11 && dln_ocg_version_minor() == 0, "core reports API 11.0");

  const uint32_t code = 15025844;
  check(dln_ocg_set_card_data(code, 0, 0x11, 4, 0x10, 0x02, 0, 800, 2000, 0, 0, 0) == 1,
        "card data registers");

  // Set codes: rejected for an unknown card, accepted and replaceable for a known one.
  check(dln_ocg_set_card_setcodes(1, nullptr, 0) == 0, "set codes rejected for unknown card");
  const uint16_t setcodes[] = {0x1234, 0x5678};
  check(dln_ocg_set_card_setcodes(code, setcodes, 2) == 1, "set codes accepted");
  check(dln_ocg_set_card_setcodes(code, nullptr, 0) == 1, "set codes clear");
  check(dln_ocg_set_card_setcodes(code, setcodes, 2) == 1, "set codes re-registered");

  check(dln_ocg_script_count() == 0, "script registry starts empty");
  check(put("dln-smoke.lua", "local marker = 1 + 1") == 1, "valid script registers");
  check(put("dln-broken.lua", "this is not lua") == 1, "malformed script registers");
  check(dln_ocg_script_count() == 2, "registry holds both scripts");
  check(dln_ocg_set_script(nullptr, 0, "x", 1) == 0, "a nameless script is rejected");

  const uint32_t handle = dln_ocg_create(0x12345678, 0x9abcdef0, 0, 0, 8000, 1, 1);
  check(handle > 0, "duel allocates");

  check(load(handle, "dln-smoke.lua") == 1, "valid script loads and runs");
  check(load(handle, "dln-broken.lua") == 0, "malformed script fails");
  check(load(handle, "dln-absent.lua") == 0, "unregistered script fails");
  check(load(0, "dln-smoke.lua") == 0, "loading against an unknown duel fails");

  // Creating a duel makes the core probe c0.lua for its internal temporary card. The
  // bridge logs that faithfully, so the expected log leads with it.
  const std::string scriptLog = take(dln_ocg_take_script_log);
  check(scriptLog == "MISS c0.lua\nOK dln-smoke.lua\nFAIL dln-broken.lua\nMISS dln-absent.lua\n",
        "script log distinguishes ok, fail, and miss");
  check(take(dln_ocg_take_script_log).empty(), "reading the script log drains it");

  const std::string engineLog = take(dln_ocg_take_engine_log);
  check(engineLog.find("dln-broken.lua") != std::string::npos,
        "the Lua error for the malformed script is surfaced");

  // A script the core requests on its own: naming it c<code>.lua must be found by the
  // card-script path, not just by an explicit load.
  check(put("c15025844.lua", "local x = 1") == 1, "card script registers");
  check(load(handle, "c15025844.lua") == 1, "card script resolves by its engine name");
  take(dln_ocg_take_script_log);

  check(dln_ocg_destroy(handle) == 1, "duel destroys");
  dln_ocg_clear_scripts();
  check(dln_ocg_script_count() == 0, "clearing empties the registry");
  dln_ocg_clear_card_data();

  // Real cards and scripts, when a bundle has been built. Skipped otherwise so the check
  // still runs in a checkout that has not fetched third-party card data.
  if (argc > 1) checkRealBundle(argv[1]);

  std::printf("\n%s (%d failure%s)\n", failures == 0 ? "PASSED" : "FAILED", failures,
              failures == 1 ? "" : "s");
  return failures == 0 ? 0 : 1;
}
