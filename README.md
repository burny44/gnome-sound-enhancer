# Sound Enhancer

A GNOME Shell extension for the built-in volume control.

- **5% volume steps** — keyboard keys, scrolling, and the Quick Settings slider always land on 0, 5, 10, …
- **Volume number** — an editable number next to the sound slider in Quick Settings

Both options live in the extension settings. They are on by default.

## Requirements

- GNOME Shell **49** or **50**

## Install

From this directory:

```bash
chmod +x install.sh
./install.sh
```

That compiles the settings schema and symlinks the extension into `~/.local/share/gnome-shell/extensions/`.

Then reload GNOME Shell:

- **Wayland:** log out and back in
- **X11:** `Alt+F2`, type `r`, press Enter

Enable it:

```bash
gnome-extensions enable sound-enhancer@burny
```

Or use the Extensions app, then open the extension settings for the two toggles.

## Uninstall

```bash
gnome-extensions disable sound-enhancer@burny
rm -f ~/.local/share/gnome-shell/extensions/sound-enhancer@burny
```

Then reload GNOME Shell as in the install steps.

## License

GPL-3.0-or-later. GNOME Shell extensions that use Shell modules are derivative works of GNOME Shell.
