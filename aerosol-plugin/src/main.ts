import * as api from "src/api";
import { client } from "src/api/client.gen";

import {
	App,
	arrayBufferToBase64,
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
	serverProtocol: string;
	serverURL: string;
	serverPort: number;
	refreshToken: string | null;
	accessToken: string | null;
}

const DEFAULT_SETTINGS: AerosolSettings = {
	connected: false,
	serverProtocol: "https",
	serverURL: "",
	serverPort: 27027,
	refreshToken: null,
	accessToken: null,
};

export class AerosolEvents extends Events {
	constructor() {
		super();
	}
}

export default class Aerosol extends Plugin {
	settings: AerosolSettings;
	events: AerosolEvents;
	renewalTimeout: number | undefined;

	async onload() {
		// init
		await this.loadSettings();
		this.events = new AerosolEvents();

		// add status bar text
		const statusBarText = this.addStatusBarItem();
		statusBarText.setText("Idle");

		// add status bar icon
		const statusBarIcon = this.addStatusBarItem();
		setIcon(statusBarIcon, "refresh-cw-off");

		// update api baseUrl when settings change
		this.registerEvent(
			this.events.on("settings-changed", () => {
				client.setConfig({
					baseUrl: `${this.settings.serverProtocol}://${this.settings.serverURL}:${this.settings.serverPort}`,
				});
			})
		);

		this.registerEvent(
			this.events.on("settings-changed", () => {
				if (this.settings.connected) {
					setIcon(statusBarIcon, "refresh-cw");
					statusBarIcon.setCssStyles({
						animation: "spin",
						animationDuration: "5000ms",
						animationIterationCount: "infinite",
						animationTimingFunction: "linear",
						color: "white",
					});
				} else {
					setIcon(statusBarIcon, "refresh-cw-off");
					statusBarIcon.setCssStyles({
						animation: undefined,
						color: "red",
					});
				}
			})
		);

		// add setting tab
		this.addSettingTab(new AerosolSettingTab(this.app, this));

		// registering of sync events
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				statusBarText.setText("create " + file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				statusBarText.setText("delete " + file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				statusBarText.setText("modify " + file.path);
				let contents = await this.app.vault.readBinary(
					this.app.vault.getFileByPath(file.path)!
				);
				let response = await api.postUser({
					body: {
						token: "123",
						username: "Akira",
					},
				});

				console.log(response.response.headers.get("Authorization"));
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				statusBarText.setText("rename " + file.path);
			})
		);

		// setup polling
		let pollingInterval: number | null = null;

		this.registerEvent(
			this.events.on("settings-changed", () => {
				if (this.settings.connected) {
					if (!pollingInterval) {
						pollingInterval = this.registerInterval(
							setInterval(async () => {
								// TODO: polling code here
							}, 5000) as any
						);
					}
				} else {
					clearInterval(pollingInterval!);
					pollingInterval = null;
				}
			})
		);

		// setup initial states
		this.events.trigger("settings-changed");
	}

	onunload() {
		clearTimeout(this.renewalTimeout);
	}

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
			.setName("Server Protocol")
			.setDesc("The protocol your Aerosol Server is accessible by")
			.addDropdown((dropdown) => {
				dropdown.addOption("https", "https");
				dropdown.addOption("http", "http");
				dropdown.setValue(this.plugin.settings.serverProtocol);
				dropdown.onChange(async (value) => {
					this.plugin.settings.serverProtocol = value;
					await this.plugin.saveSettings();
					this.plugin.events.trigger("settings-changed");
				});
			})
			.setDisabled(this.plugin.settings.connected);

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
						this.plugin.events.trigger("settings-changed");
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
						this.plugin.events.trigger("settings-changed");
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
						await disconnect(this.plugin);
						this.display();
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
						await register(this.plugin);
						await renewToken(this.plugin);
						this.display();
					});
				});
		}
	}
}

async function register(plugin: Aerosol) {
	let apiCall;
	try {
		apiCall = await api.postUser({
			body: {
				token: "123",
				username: "Akira",
			},
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		plugin.settings.connected = true;
		plugin.settings.refreshToken =
			apiCall.response.headers.get("Authorization");
		await plugin.saveSettings();
		plugin.events.trigger("settings-changed");

		new Notice("Registation successfull");
	} else {
		new Notice(
			`Couldn't register: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function disconnect(plugin: Aerosol) {
	plugin.settings.connected = false;
	plugin.settings.refreshToken = null;
	plugin.settings.accessToken = null;
	await plugin.saveSettings();
	plugin.events.trigger("settings-changed");
}

async function renewToken(plugin: Aerosol) {
	if (!plugin.settings.refreshToken) {
		new Notice("Couldn't renew access token - refresh token not set");
		return;
	}

	let apiCall;
	try {
		apiCall = await api.getUser({
			auth: plugin.settings.refreshToken,
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		plugin.settings.accessToken =
			apiCall.response.headers.get("Authorization");

		let timeTillRenewal =
			apiCall.data!.expiresIn! > 70 ? apiCall.data!.expiresIn! - 10 : 60;

		clearTimeout(plugin.renewalTimeout);
		plugin.renewalTimeout = setTimeout(
			() => renewToken(plugin),
			timeTillRenewal * 1000
		) as any;

		await plugin.saveSettings();
		plugin.events.trigger("settings-changed");

		new Notice("Token renewal successfull");
	} else {
		new Notice(
			`Couldn't renew access token: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}
