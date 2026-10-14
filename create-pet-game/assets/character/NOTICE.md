# Character rendering components

The files under vendor/ are from https://github.com/ShunyuYao/pet-ragdoll-renderer at 73ce21b3d8d7f7398b1d389329a6c65cb69ee2ee (MIT), plus its Three.js 0.164.1 and cannon-es 0.20.0 dependencies (MIT). Full licenses are included. Modifications: garment-rig accepts an already decoded contour object instead of fetching a URL, to respect the HTML work CSP; texture-budget decodes bounded PNG data URLs without network fetch; ragdoll-adapter provenance points to the public upstream source. No photo, clothing texture or private character pack is included.

sprite.mjs and pet-character.js are original create-pet-game code. The source of pet-hide-duel is a behavioral/protocol reference only; none of its reserved game code is redistributed here.
