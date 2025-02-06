import * as api from "src/api"

import {
	App,
	ButtonComponent,
	Editor,
	Events,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TextComponent,
} from "obsidian";

interface AerosolSettings {
	connected: boolean;
	serverURL: string;
	serverPort: number;
}

const DEFAULT_SETTINGS: AerosolSettings = {
	connected: false,
	serverURL: "",
	serverPort: 27027,
};

export class AerosolEvents extends Events {
	constructor() {
		super();
	}
}

export default class Aerosol extends Plugin {
	settings: AerosolSettings;
	events: AerosolEvents;

	async onload() {
		await this.loadSettings();
		this.events = new AerosolEvents();

		const statusBarItem = this.addStatusBarItem();
		setIcon(statusBarItem, "refresh-cw-off");

		this.registerEvent(
			this.events.on("settings-changed", () => {
				if (this.settings.connected) {
					setIcon(statusBarItem, "refresh-cw");
					statusBarItem.setCssStyles({
						animation: "spin",
						animationDuration: "5000ms",
						animationIterationCount: "infinite",
						animationTimingFunction: "linear",
						color: "white",
					});
				} else {
					setIcon(statusBarItem, "refresh-cw-off");
					statusBarItem.setCssStyles({
						animation: undefined,
						color: "red",
					});
				}
			})
		);

		this.addSettingTab(new AerosolSettingTab(this.app, this));

		this.events.trigger("settings-changed");
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AerosolSettingTab extends PluginSettingTab {
	plugin: Aerosol;

	constructor(app: App, plugin: Aerosol) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setHeading().setName("Aerosol Setup");

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("The URL your Aerosol Server can be reached at")
			.addText((text) =>
				text
					.setPlaceholder("aerosol.example.net")
					.setValue(this.plugin.settings.serverURL)
					.onChange(async (value) => {
						this.plugin.settings.serverURL = value;
						await this.plugin.saveSettings();
					})
			)
			.setDisabled(this.plugin.settings.connected);

		new Setting(containerEl)
			.setName("Server Port")
			.setDesc("The port your Aerosol Server listens on")
			.addText((text) =>
				text
					.setPlaceholder("27027")
					.setValue(this.plugin.settings.serverPort.toString())
					.onChange(async (value) => {
						this.plugin.settings.serverPort = Number(value);
						await this.plugin.saveSettings();
					})
			)
			.setDisabled(this.plugin.settings.connected);

		if (this.plugin.settings.connected) {
			new Setting(containerEl)
				.setName("Disconnect")
				.setDesc(
					"After disconnecting your Vault won't be synced and backed up until you connect again!"
				)
				.addButton((button: ButtonComponent) => {
					button.setWarning();
					button.setIcon("log-out");
					button.onClick(async (event: MouseEvent) => {
						this.plugin.settings.connected = false;
						await this.plugin.saveSettings();
						this.display();
						this.plugin.events.trigger("settings-changed");
					});
				});
		} else {
			new Setting(containerEl)
				.setName("Connect")
				.setDesc(
					"Connecting will setup your connection to the Server and begin syncing you data"
				)
				.addButton((button: ButtonComponent) => {
					button.setIcon("log-in");
					button.onClick(async (event: MouseEvent) => {
						this.plugin.settings.connected = true;
						await this.plugin.saveSettings();
						this.display();
						this.plugin.events.trigger("settings-changed");
					});
				});
		}
	}
}
