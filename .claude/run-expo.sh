#!/bin/bash
export PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"
cd "$(dirname "$0")/../mobile"
exec npx expo start
