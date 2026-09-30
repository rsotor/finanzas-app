#!/usr/bin/env python3
"""Valida todos los presets de app/presets/ contra cartera.schema.json."""
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

PRESETS_DIR = Path(__file__).resolve().parent.parent / "app" / "presets"
SCHEMA_PATH = PRESETS_DIR / "cartera.schema.json"
# Ficheros del directorio que NO son presets de producto/cartera:
SKIP = {"index.json", "cartera.schema.json"}


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft7Validator(schema)

    preset_files = sorted(
        p for p in PRESETS_DIR.glob("*.json") if p.name not in SKIP
    )
    if not preset_files:
        print("No se encontraron presets que validar", file=sys.stderr)
        return 1

    failures = 0
    for preset in preset_files:
        data = json.loads(preset.read_text(encoding="utf-8"))
        errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
        if errors:
            failures += 1
            print(f"FAIL  {preset.name}")
            for err in errors:
                loc = "/".join(str(p) for p in err.path) or "(raíz)"
                print(f"      - {loc}: {err.message}")
        else:
            print(f"OK    {preset.name}")

    print(f"\n{len(preset_files) - failures}/{len(preset_files)} presets válidos")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
