#!/usr/bin/env bash
# Start Tunerite with the MIDI bridge over self-signed https (the phone needs it for the microphone)
# and print the address to open on a phone. Extra arguments (port, device, --local) are passed through.
cd "$(dirname "$0")" && exec python3 tools/midi_bridge.py --https "$@"
