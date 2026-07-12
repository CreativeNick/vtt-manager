# THEMES:

(universal feel/use/tone of program)

---

- UI/UX should look and feel tactile like you're physically interacting with it and widgets like playing D&D in real life
- This involves live syncing across players/DM(s) and we are using Cloudflare R2 Storage (free and 10GB), must keep in mind this storage and network limit while making things

# TODO:

(things to add/complete)

---

- Figure out layout for all important menus (take some inspiration from FoundryVTT and how they do their layout)
  - I'm debating whether to include multiple separate full pages that the player/DM can go to, such as the board page, the character page, etc etc.
  - Make sure to look into how FoundryVTT does their layout and take inspiration from that
- Add 3D dice rolling (and possibly a dice tray with all the different types of die)
  - Should the die have textures? Will it take up too much storage or make things slow for those with lower-end computers?
  - How far should the die roll on the map area? Don't want it to cover the UI.
  - Make sure other players/DMs can grab the die and let go/throw it. It should be synced so everyone can see the die being grabbed and thrown/rolled.
    - Everyone can see player rolls
    - DM can make their rolls secret (for physical dice roll, the numbers on the dice will simply not be visible
- Improve character sheet (make sure it's user-friendly)
- Make dice rolls take into account character sheet stats/modifiers (for DM it will be slightly different since the DM can control multiple NPCs)
- Roll and action log
- Add roll for initiative (initiate) button for DM
- Improve adding and removing of tokens
  - Clicking on a token should be able to pull up their respective character sheet
    - For example, if the token is an enemy creature the players have never met before, the character sheet should be blank for the player but the DM can see everything and edit it right there if necessary. All attributes of that character sheet should be completely hidden to the players by default and the DM can uncheck certain sections to reveal to the players.
- Ability to change grid size as DM
- Measure distance
- Annotations
- DM able to add walls, light sources, etc for vision/light mechanic. Also include character vision based on where they are looking.
- This is just an initial stuff of things I want to implement, please look into other ideas that you think should be added



# IDEAS:

(optional or potential things to add)

---

- Built-in Soundboard
  - How would it work for cloudflare syncing? I have cloudflare r2 free 10GB storage so I want to make sure it doesn't take up too much storage or clog up the network.
- Option to put in custom CSS for custom themes

