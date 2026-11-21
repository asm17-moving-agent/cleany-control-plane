#!/usr/bin/env bash
# Build against the same TensorRT Edge-LLM SDK and CUDA device objects as llm_inference.
set -euo pipefail
if [[ $# != 3 ]]; then
    echo "usage: build_text_runner.sh SDK_SOURCE SDK_BUILD OUTPUT" >&2
    exit 2
fi
sdk=$(realpath "$1")
build=$(realpath "$2")
output=$(realpath -m "$3")
cuda="${CUDA_HOME:-/usr/local/cuda}"
here=$(cd "$(dirname "$0")" && pwd)
device_object="$build/examples/llm/CMakeFiles/llm_inference.dir/cmake_device_link.o"
c++ -std=c++17 -O2 -Wno-deprecated-declarations -DTRT_EDGELLM_CUDA_LIBRARY_T_COMPAT \
    -I"$sdk/cpp" -I"$sdk/examples/utils" -I"$sdk/3rdParty/nlohmannJson/include" \
    -I"$sdk/3rdParty/stb" -I"$sdk/3rdParty/miniaudio" -I"$cuda/include" \
    "$here/qwen_text_runner.cpp" "$device_object" -o "$output" \
    -Wl,--unresolved-symbols=ignore-in-shared-libs \
    "$build/cpp/libedgellmCore.a" "$build/examples/utils/libexampleUtils.a" "$build/cpp/libedgellmCore.a" \
    "$sdk/cpp/kernels/cuteDSLArtifact/aarch64/sm_87/libcutedsl_aarch64.a" \
    "$build/cpp/libtrt_edgellm_cutedsl_cudart_shim.a" \
    -L"$cuda/targets/aarch64-linux/lib" -Wl,-rpath,"$cuda/lib64" \
    -lcuda -lnvonnxparser -lnvinfer -lcudart -lcudadevrt -lcudart_static -lrt -lpthread -ldl
