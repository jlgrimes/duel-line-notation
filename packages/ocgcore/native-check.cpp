// Native harness for the DLN bridge. Emscripten is not available here, so this compiles
// the pinned core, Lua, and bridge.cpp for the host and exercises the new script-resolver
// exports directly. It mirrors what packages/ocgcore/scripts/smoke.mjs asserts in CI.

#include <cstdint>
#include <cstdio>
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

int main() {
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

  std::printf("\n%s (%d failure%s)\n", failures == 0 ? "PASSED" : "FAILED", failures,
              failures == 1 ? "" : "s");
  return failures == 0 ? 0 : 1;
}
