# Blueprint Command Workflow

## Purpose

This document explains how new Discord commands are added and how they connect to Blueprint definitions for image report generation.

## Process for adding a new command

1. Add the command spec under `Distribution/Interaction/Discord/commands/`.
2. Create or update the matching blueprint in `Workshop/Draftsman/Blueprint/`.
3. Add a mapping entry in `Workshop/Draftsman/command-blueprints.json`.
4. Ensure `Workshop/Draftsman/blueprints.js` can resolve the command to the blueprint.

## Example mapping

```json
{
  "fan_gain": "fan_gain",
  "profile": "profile",
  "circle": "circle",
  "set_fans": "set_fans",
  "link": "link",
  "new_command": "new_blueprint"
}
```

## How the interaction code uses it

1. Receive Discord command `/new_command`
2. Validate request data
3. Resolve the blueprint:

```js
const { getBlueprintForCommand } = require('../Workshop/Draftsman/blueprints');
const blueprintText = await getBlueprintForCommand('/new_command');
```

4. Load product data for the requested command
5. Render the result according to the blueprint
6. Send the report back through Discord

## Notes

- The command file and blueprint file should be named consistently.
- The command mapping is centralized in `command-blueprints.json`.
- This keeps commands and blueprints decoupled but linked by the mapping.
