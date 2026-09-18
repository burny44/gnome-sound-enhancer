import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const STEP_PERCENT = 5;
const STEP = STEP_PERCENT / 100;
const MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const VOLUME_STEP_KEY = 'volume-step';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function snapPercent(percent, maxPercent) {
    const snapped = Math.round(percent / STEP_PERCENT) * STEP_PERCENT;
    return clamp(snapped, 0, maxPercent);
}

function snapValue(value, maxValue) {
    const maxPercent = Math.round(maxValue * 100);
    return snapPercent(value * 100, maxPercent) / 100;
}

function volumePercent(output) {
    const stream = output?.stream;
    if (!stream || !output._control)
        return 0;
    if (stream.is_muted)
        return 0;
    return (stream.volume / output._control.get_vol_max_norm()) * 100;
}

function maxVolumePercent(output) {
    if (!output?.getMaxLevel)
        return 100;
    return Math.round(output.getMaxLevel() * 100);
}

export default class SoundEnhancer extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._mediaKeys = this._loadMediaKeys();
        this._savedVolumeStep = null;
        this._output = null;
        this._entry = null;
        this._entryEditing = false;
        this._busy = false;
        this._injectTries = 0;
        this._injectSource = 0;
        this._streamUpdatedId = 0;
        this._sliderNotifyId = 0;

        this._settings.connectObject(
            'changed::five-percent-steps',
            () => this._syncSteps(),
            'changed::show-volume-number',
            () => this._syncEntry(),
            this
        );

        this._ensureHooked();
    }

    disable() {
        if (this._injectSource) {
            GLib.source_remove(this._injectSource);
            this._injectSource = 0;
        }

        this._removeEntry();
        this._unhookOutput();
        this._restoreVolumeStep();

        this._settings?.disconnectObject(this);
        this._settings = null;
        this._mediaKeys = null;
        this._output = null;
    }

    _loadMediaKeys() {
        const source = Gio.SettingsSchemaSource.get_default();
        if (!source?.lookup(MEDIA_KEYS_SCHEMA, true))
            return null;
        return new Gio.Settings({schema_id: MEDIA_KEYS_SCHEMA});
    }

    _getOutputSlider() {
        const qs = Main.panel.statusArea.quickSettings;
        return qs?._volumeOutput?._output ?? qs?._volume?._output ?? null;
    }

    _ensureHooked() {
        const output = this._getOutputSlider();
        if (!output?.slider) {
            if (this._injectTries >= 15)
                return;
            this._injectTries++;
            this._injectSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._injectSource = 0;
                this._ensureHooked();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._hookOutput(output);
        this._syncSteps();
        this._syncEntry();
    }

    _hookOutput(output) {
        if (this._output === output && output._gseOriginalSliderChanged)
            return;

        this._unhookOutput();
        this._output = output;

        output._gseOriginalSliderChanged = output._sliderChanged.bind(output);
        output._sliderChanged = () => this._onSliderChanged();

        output._gseOriginalStep = output.slider.step.bind(output.slider);
        output.slider.step = nSteps => this._onSliderStep(nSteps);

        this._streamUpdatedId = output.connect('stream-updated', () => {
            this._snapStreamIfNeeded();
            this._syncEntryText();
        });
        this._sliderNotifyId = output.slider.connect('notify::value', () => {
            this._syncEntryText();
        });
    }

    _unhookOutput() {
        const output = this._output;
        if (!output)
            return;

        if (this._streamUpdatedId) {
            output.disconnect(this._streamUpdatedId);
            this._streamUpdatedId = 0;
        }
        if (this._sliderNotifyId && output.slider) {
            output.slider.disconnect(this._sliderNotifyId);
            this._sliderNotifyId = 0;
        }

        if (output._gseOriginalSliderChanged) {
            output._sliderChanged = output._gseOriginalSliderChanged;
            delete output._gseOriginalSliderChanged;
        }
        if (output._gseOriginalStep && output.slider) {
            output.slider.step = output._gseOriginalStep;
            delete output._gseOriginalStep;
        }

        this._output = null;
    }

    _stepsEnabled() {
        return this._settings?.get_boolean('five-percent-steps') === true;
    }

    _numberEnabled() {
        return this._settings?.get_boolean('show-volume-number') === true;
    }

    _syncSteps() {
        this._applyVolumeStep();
        this._snapStreamIfNeeded();
        this._syncEntryText();
    }

    _applyVolumeStep() {
        if (!this._mediaKeys)
            return;

        if (this._stepsEnabled()) {
            if (this._savedVolumeStep === null)
                this._savedVolumeStep = this._mediaKeys.get_int(VOLUME_STEP_KEY);
            if (this._mediaKeys.get_int(VOLUME_STEP_KEY) !== STEP_PERCENT)
                this._mediaKeys.set_int(VOLUME_STEP_KEY, STEP_PERCENT);
            return;
        }

        this._restoreVolumeStep();
    }

    _restoreVolumeStep() {
        if (!this._mediaKeys || this._savedVolumeStep === null)
            return;
        this._mediaKeys.set_int(VOLUME_STEP_KEY, this._savedVolumeStep);
        this._savedVolumeStep = null;
    }

    _onSliderChanged() {
        const output = this._output;
        if (!output)
            return;

        if (this._stepsEnabled() && !this._busy) {
            const snapped = snapValue(output.slider.value, output.slider.maximum_value);
            if (Math.abs(output.slider.value - snapped) > 0.0005) {
                output.slider.block_signal_handler(output._sliderChangedId);
                output.slider.value = snapped;
                output.slider.unblock_signal_handler(output._sliderChangedId);
            }
        }

        output._gseOriginalSliderChanged();
        this._syncEntryText();
    }

    _onSliderStep(nSteps) {
        const output = this._output;
        if (!output)
            return false;

        if (!this._stepsEnabled())
            return output._gseOriginalStep(nSteps);

        const slider = output.slider;
        if (typeof slider._applyDelta === 'function')
            return slider._applyDelta(nSteps * STEP);

        const old = slider.value;
        slider.value = clamp(old + nSteps * STEP, 0, slider.maximum_value);
        return slider.value !== old;
    }

    _snapStreamIfNeeded() {
        const output = this._output;
        const stream = output?.stream;
        if (!this._stepsEnabled() || this._busy || !stream || stream.is_muted)
            return;

        const maxNorm = output._control.get_vol_max_norm();
        if (!maxNorm)
            return;

        const percent = (stream.volume / maxNorm) * 100;
        const snapped = snapPercent(percent, maxVolumePercent(output));
        if (Math.abs(percent - snapped) < 0.6)
            return;

        this._setVolumePercent(snapped);
    }

    _setVolumePercent(percent) {
        const output = this._output;
        if (!output?.slider)
            return;

        const maxPercent = maxVolumePercent(output);
        let next = clamp(Math.round(percent), 0, maxPercent);
        if (this._stepsEnabled())
            next = snapPercent(next, maxPercent);

        const target = next / 100;
        this._busy = true;
        try {
            if (Math.abs(output.slider.value - target) > 0.0005)
                output.slider.value = target;
            else
                output._gseOriginalSliderChanged();
        } finally {
            this._busy = false;
        }
        this._syncEntryText();
    }

    _syncEntry() {
        if (this._numberEnabled())
            this._addEntry();
        else
            this._removeEntry();
    }

    _addEntry() {
        const output = this._output;
        if (!output || this._entry)
            return;

        const box = output.get_first_child();
        if (!box)
            return;

        const entry = new St.Entry({
            style_class: 'sound-enhancer-volume-entry',
            can_focus: true,
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
            hint_text: '0',
        });
        entry.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        entry.clutter_text.max_length = 3;
        entry.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        entry.accessible_name = 'Volume percent';

        entry.clutter_text.connect('key-focus-in', () => {
            this._entryEditing = true;
            entry.clutter_text.set_selection(0, -1);
        });
        entry.clutter_text.connect('key-focus-out', () => {
            this._applyEntry();
            this._entryEditing = false;
            this._syncEntryText();
        });
        entry.clutter_text.connect('activate', () => {
            this._applyEntry();
            this._entryEditing = false;
            global.stage.set_key_focus(null);
        });

        const children = box.get_children();
        let index = children.length;
        if (output._menuButton) {
            const menuIndex = children.indexOf(output._menuButton);
            if (menuIndex >= 0)
                index = menuIndex;
        }
        box.insert_child_at_index(entry, index);
        this._entry = entry;
        this._syncEntryText();
    }

    _removeEntry() {
        this._entryEditing = false;
        this._entry?.destroy();
        this._entry = null;
    }

    _syncEntryText() {
        if (!this._entry || this._entryEditing)
            return;

        const output = this._output;
        if (!output)
            return;

        const percent = Math.round(volumePercent(output));
        const text = `${percent}`;
        if (this._entry.text !== text)
            this._entry.text = text;
    }

    _applyEntry() {
        if (!this._entry || !this._output)
            return;

        const raw = this._entry.text.trim();
        if (raw === '') {
            this._syncEntryText();
            return;
        }

        const value = Number.parseInt(raw, 10);
        if (!Number.isInteger(value)) {
            this._syncEntryText();
            return;
        }

        this._setVolumePercent(value);
    }
}
