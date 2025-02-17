import * as api from "src/api";
import { client } from "src/api/client.gen";

import {
	App,
	arrayBufferToBase64,
	base64ToArrayBuffer,
	ButtonComponent,
	Events,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
} from "obsidian";
import * as SparkMD5 from "spark-md5";

interface AerosolSettings {
	connected: boolean;
	serverProtocol: string;
	serverURL: string;
	serverPort: number;
	registrationToken: string;
	refreshToken: string | null;
	accessToken: {
		token: string;
		validUntil: EpochTimeStamp;
	} | null;
}

const DEFAULT_SETTINGS: AerosolSettings = {
	connected: false,
	serverProtocol: "https",
	serverURL: "",
	serverPort: 27027,
	registrationToken: "",
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
	checksums: { vault: string; files: Record<string, string> };
	statusBarText: HTMLElement;

	async onload() {
		// init
		await this.loadSettings();
		this.events = new AerosolEvents();
		await calculateChecksums(this);

		// add status bar text
		this.statusBarText = this.addStatusBarItem();
		this.statusBarText.setText("Idle");

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
			this.app.vault.on("create", async (file) => {
				this.statusBarText.setText("create " + file.path);
				await uploadFile(this, file.path);
				await recalculateChecksums(this, file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				this.statusBarText.setText("delete " + file.path);
				await deleteFile(this, file.path);
				await recalculateChecksums(this, file.path, true);
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				this.statusBarText.setText("modify " + file.path);
				await uploadFile(this, file.path);
				await recalculateChecksums(this, file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				this.statusBarText.setText("rename " + file.path);
				await renameFile(this, oldPath, file.path);
				await recalculateChecksums(this, oldPath, true);
				await recalculateChecksums(this, file.path);
			})
		);

		// setup polling
		let pollingInterval: number | null = null;

		this.registerEvent(
			this.events.on("settings-changed", async () => {
				if (this.settings.connected) {
					if (!pollingInterval) {
						await poll(this);
						pollingInterval = this.registerInterval(
							setInterval(() => poll(this), 5000) as any
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
			.setDesc("The token provided by your server admin")
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

		new Setting(containerEl)
			.setName("Registration Token")
			.setDesc("The port your Aerosol Server listens on")
			.addText((text) =>
				text
					.setPlaceholder("XXXXX")
					.setValue(this.plugin.settings.registrationToken)
					.onChange(async (value) => {
						this.plugin.settings.registrationToken = value;
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
				token: plugin.settings.registrationToken,
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
	if (
		plugin.settings.accessToken &&
		Date.now() < plugin.settings.accessToken?.validUntil
	) {
		return;
	}

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

	if (
		apiCall.response.status == 200 &&
		apiCall.response.headers.get("Authorization")
	) {
		plugin.settings.accessToken! = {
			token: apiCall.response.headers.get("Authorization")!,
			validUntil: Date.now() + (apiCall.data!.expiresIn! - 10) * 1000,
		};

		await plugin.saveSettings();
		plugin.events.trigger("settings-changed");

		new Notice("Token renewal successfull");
	} else {
		new Notice(
			`Couldn't renew access token: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function uploadFile(plugin: Aerosol, path: string) {
	await renewToken(plugin);
	if (!plugin.settings.accessToken) {
		new Notice("Couldn't sync - access token not set");
		return;
	}

	let file = plugin.app.vault.getFileByPath(path);
	if (!file) {
		new Notice("Couldn't sync - couldn't open file");
		return;
	}

	let contensBin = await plugin.app.vault.readBinary(file);
	if (!contensBin) {
		new Notice("Couldn't sync - couldn't read file");
		return;
	}

	let apiCall;
	try {
		apiCall = await api.putFile({
			body: {
				filename: path,
				contents: arrayBufferToBase64(contensBin),
			},
			auth: plugin.settings.accessToken.token,
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		new Notice("Sync successfull");
	} else {
		new Notice(
			`Couldn't Sync: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function deleteFile(plugin: Aerosol, path: string) {
	await renewToken(plugin);
	if (!plugin.settings.accessToken) {
		new Notice("Couldn't sync - access token not set");
		return;
	}

	let apiCall;
	try {
		apiCall = await api.deleteFile({
			auth: plugin.settings.accessToken.token,
			query: {
				filename: path,
			},
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		new Notice("Sync successfull");
	} else {
		new Notice(
			`Couldn't Sync: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function renameFile(plugin: Aerosol, path: string, newPath: string) {
	await renewToken(plugin);
	if (!plugin.settings.accessToken) {
		new Notice("Couldn't sync - access token not set");
		return;
	}

	let apiCall;
	try {
		apiCall = await api.patchFile({
			auth: plugin.settings.accessToken.token,
			query: {
				filename: path,
				newFilename: newPath,
			},
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		new Notice("Sync successfull");
	} else {
		new Notice(
			`Couldn't Sync: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function calculateChecksums(plugin: Aerosol) {
	const files = plugin.app.vault.getFiles();
	let fileChecksums: Record<string, string> = {};
	for (const file of files) {
		fileChecksums[file.path] = SparkMD5.ArrayBuffer.hash(
			await plugin.app.vault.readBinary(
				plugin.app.vault.getFileByPath(file.path)!
			)
		);
	}
	const vaultChecksum = SparkMD5.hash(
		JSON.stringify(Object.entries(fileChecksums).sort())
	);

	plugin.checksums = {
		vault: vaultChecksum,
		files: fileChecksums,
	};
}

async function recalculateChecksums(
	plugin: Aerosol,
	path: string,
	deleted = false
) {
	if (deleted) {
		delete plugin.checksums.files[path];
	} else {
		plugin.checksums.files[path] = SparkMD5.ArrayBuffer.hash(
			await plugin.app.vault.readBinary(
				plugin.app.vault.getFileByPath(path)!
			)
		);
	}
	plugin.checksums.vault = SparkMD5.hash(
		JSON.stringify(Object.entries(plugin.checksums.files).sort())
	);
}

async function downloadFile(plugin: Aerosol, path: string) {
	await renewToken(plugin);
	if (!plugin.settings.accessToken) {
		new Notice("Couldn't sync - access token not set");
		return;
	}

	let apiCall;
	try {
		apiCall = await api.getFile({
			query: {
				filename: path,
			},
			auth: plugin.settings.accessToken.token,
		});
	} catch {
		new Notice("Couldn't reach the Server");
		return;
	}

	if (apiCall.response.status == 200) {
		const file = plugin.app.vault.getFileByPath(path);
		if (file) {
			plugin.app.vault.modifyBinary(
				file,
				base64ToArrayBuffer(apiCall.data!.contents!)
			);
		} else {
			plugin.app.vault.createBinary(
				path,
				base64ToArrayBuffer(apiCall.data!.contents!)
			);
		}

		new Notice("Sync successfull");
	} else {
		new Notice(
			`Couldn't Sync: ${apiCall.response.status} - ${apiCall.response.statusText}`
		);
	}
}

async function poll(plugin: Aerosol) {
	plugin.statusBarText.setText("polling");
	await renewToken(this);
	const res = await api.getChecksum({
		auth: this.settings.accessToken!.token,
	});
	if (res.response.status != 200) {
		new Notice("Polling error");
		return;
	}

	if (res.data!.checksum == this.checksums.vault) {
		plugin.statusBarText.setText("done");
	} else {
		plugin.statusBarText.setText("checksum mismatch");
		await renewToken(this);
		const res = await api.getChecksums({
			auth: this.settings.accessToken!.token,
			query: {
				filename: "/",
			},
		});

		// Check for new or changed files
		for (const key in res.data) {
			if (
				!(key in this.checksums.files) ||
				res.data[key] !== this.checksums.files[key]
			) {
				console.log("changed or new " + key);
				await downloadFile(this, key);
			}
		}

		// Check for deleted files
		for (const key in this.checksums.files) {
			if (!(key in res.data!)) {
				console.log("deleted " + key);
				this.app.vault.delete(this.app.vault.getFileByPath(key)!);
			}
		}
	}
}
