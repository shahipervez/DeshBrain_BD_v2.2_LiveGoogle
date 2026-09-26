# DeshBrain BD v2.1 bug fix

## Fixed
- First-message chat validation error caused by `conversationId: null`.
- Frontend now omits `conversationId` until a chat exists.
- Backend also safely accepts `null` for backward compatibility.
- Failed chat requests are rolled back from in-memory client history so retrying does not duplicate the user message.
- Validation errors show field-level details in the UI.
- Destination-only traffic questions now ask for the missing origin instead of returning unrelated generic help.

## Root cause
The browser sent `conversationId: null` for a new chat. The API schema allowed only string/number/undefined, so Zod returned HTTP 400 `Validation failed` before the local AI fallback could run.
