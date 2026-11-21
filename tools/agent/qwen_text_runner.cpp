// Text-only request loop for the Jetson TensorRT Edge-LLM SDK.
#include "common/trtUtils.h"
#include "requestFileParser.h"
#include "runtime/llmInferenceRuntime.h"

#include <cuda_runtime.h>
#include <nlohmann/json.hpp>
#include <unistd.h>

#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>

using namespace trt_edgellm;

int main(int argc, char** argv) {
    if (argc != 3) return 2;
    // The SDK writes diagnostics to stdout. Keep the supervisor's reply pipe separate.
    FILE* replies = fdopen(dup(STDOUT_FILENO), "w");
    if (!replies || dup2(STDERR_FILENO, STDOUT_FILENO) < 0) return 1;
    cudaStream_t stream{};
    if (cudaStreamCreateWithFlags(&stream, cudaStreamNonBlocking) != cudaSuccess) return 1;
    int status = 0;
    try {
        auto plugins = loadEdgellmPluginLib();
        rt::LLMInferenceRuntime model(argv[1], "", {}, stream, {}, argv[2]);
        model.captureDecodingCUDAGraph(stream);
        std::fputs("{\"ready\":true}\n", replies);
        std::fflush(replies);
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line != "run") throw std::invalid_argument("unexpected command");
            // The parent owns this private directory and serializes all requests.
            auto parsed = exampleUtils::parseRequestFile("request.json");
            if (parsed.second.size() != 1 || parsed.second.front().requests.size() != 1)
                throw std::invalid_argument("expected a single request");
            rt::LLMGenerationResponse response;
            if (!model.handleRequest(parsed.second.front(), response, stream)
                || response.outputTexts.size() != 1 || response.finishReasons.size() != 1)
                throw std::runtime_error("inference failed");
            auto reply = nlohmann::json{{"output_text", response.outputTexts.front()},
                {"finish_reason", rt::finishReasonName(response.finishReasons.front())}}.dump();
            std::fprintf(replies, "%s\n", reply.c_str());
            std::fflush(replies);
        }
    } catch (const std::exception& error) {
        std::fprintf(stderr, "Text runner failed: %s\n", error.what());
        status = 1;
    }
    cudaStreamDestroy(stream);
    std::fclose(replies);
    return status;
}
