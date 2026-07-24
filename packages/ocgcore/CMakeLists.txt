cmake_minimum_required(VERSION 3.20)

project(dln_ocgcore_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "@dln/ocgcore must be configured with the Emscripten CMake toolchain.")
endif()

set(OCGCORE_SOURCE_DIR "" CACHE PATH "Path to the pinned ygopro-core checkout")
set(OCGCORE_DIST_DIR "" CACHE PATH "Directory for generated JavaScript and WebAssembly")

if(NOT IS_DIRECTORY "${OCGCORE_SOURCE_DIR}")
  message(FATAL_ERROR "OCGCORE_SOURCE_DIR does not exist: ${OCGCORE_SOURCE_DIR}")
endif()

if(NOT EXISTS "${OCGCORE_SOURCE_DIR}/ocgapi.h")
  message(FATAL_ERROR "OCGCORE_SOURCE_DIR is not a ygopro-core checkout: ${OCGCORE_SOURCE_DIR}")
endif()

if(NOT EXISTS "${OCGCORE_SOURCE_DIR}/lua/src/lua.h")
  message(FATAL_ERROR "The pinned Lua submodule is missing. Run npm run fetch first.")
endif()

if(OCGCORE_DIST_DIR STREQUAL "")
  set(OCGCORE_DIST_DIR "${CMAKE_CURRENT_BINARY_DIR}/dist")
endif()

file(GLOB OCGCORE_SOURCES CONFIGURE_DEPENDS
  "${OCGCORE_SOURCE_DIR}/*.cpp"
  "${OCGCORE_SOURCE_DIR}/RNG/*.cpp"
)

file(GLOB LUA_SOURCES CONFIGURE_DEPENDS
  "${OCGCORE_SOURCE_DIR}/lua/src/*.c"
)

list(FILTER LUA_SOURCES EXCLUDE REGEX "/(lbitlib|lcorolib|ldblib|linit|loadlib|loslib|ltests|lua|luac|lutf8lib|onelua)\\.c$")

add_executable(ocgcore
  bridge.cpp
  ${OCGCORE_SOURCES}
  ${LUA_SOURCES}
)

set_target_properties(ocgcore PROPERTIES
  CXX_STANDARD 17
  CXX_STANDARD_REQUIRED YES
  CXX_EXTENSIONS NO
  OUTPUT_NAME "ocgcore"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OCGCORE_DIST_DIR}"
)

set_source_files_properties(${LUA_SOURCES} PROPERTIES
  LANGUAGE CXX
  COMPILE_OPTIONS "-include;${OCGCORE_SOURCE_DIR}/lua/luaconf-customize.h"
)

target_include_directories(ocgcore PRIVATE
  "${OCGCORE_SOURCE_DIR}"
  "${OCGCORE_SOURCE_DIR}/lua"
  "${OCGCORE_SOURCE_DIR}/lua/src"
)

# ocgcore explicitly verifies that Lua errors unwind C++ stack frames. Emscripten
# disables exception support by default, so both the core and Lua must opt in.
target_compile_options(ocgcore PRIVATE
  -Wno-unused-parameter
  -fexceptions
)

target_link_options(ocgcore PRIVATE
  "--no-entry"
  "-fexceptions"
  "-sDISABLE_EXCEPTION_CATCHING=0"
  "-sASSERTIONS=1"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sEXPORT_NAME=createOcgcore"
  "-sENVIRONMENT=web,worker,node"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sNO_EXIT_RUNTIME=1"
  "-sFILESYSTEM=0"
  "-sINVOKE_RUN=0"
  "-sERROR_ON_UNDEFINED_SYMBOLS=1"
  "-sEXPORTED_FUNCTIONS=['_dln_ocg_version_major','_dln_ocg_version_minor','_dln_ocg_create','_dln_ocg_destroy','_dln_ocg_start','_dln_ocg_process','_dln_ocg_get_message','_dln_ocg_set_response','_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['cwrap','HEAPU8','HEAPU32']"
)
