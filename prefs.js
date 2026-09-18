import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SoundEnhancerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.default_width = 520;
        window.default_height = 280;

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Sound',
            description: 'These options enhance GNOME’s existing volume control. They do not add extra toggles to Quick Settings.',
        });
        page.add(group);

        const steps = new Adw.SwitchRow({
            title: '5% volume steps',
            subtitle: 'Always change volume in 5% increments. Fixes the mixed 5/6% jumps from keyboard keys and the slider.',
        });
        settings.bind('five-percent-steps', steps, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(steps);

        const number = new Adw.SwitchRow({
            title: 'Volume number in Quick Settings',
            subtitle: 'Add a box next to the sound slider that shows the volume and lets you type a value.',
        });
        settings.bind('show-volume-number', number, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(number);
    }
}
