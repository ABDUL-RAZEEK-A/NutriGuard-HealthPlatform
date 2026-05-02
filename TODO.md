# TODO: Fix AI Chat API Limit Issues

## Issues Found:
1. Multiple API keys are concatenated into a single string (line 2 in geminiService.ts)
2. `chatWithNutritionist` doesn't use the fallback mechanism used by other functions
3. No specific handling for API rate limit (429) errors

## Plan:
1. [x] Read and analyze geminiService.ts to understand current implementation
2. [ ] Fix API keys format - convert comma-separated string into proper array
3. [ ] Update `chatWithNutritionist` to use `generateContentWithFallback`
4. [ ] Add rate limit error detection and handling
5. [ ] Test the changes

## Files to Edit:
- `src/services/geminiService.ts` - Fix API keys and add fallback to chat function
