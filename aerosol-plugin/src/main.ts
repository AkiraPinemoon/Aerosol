import {
	App,
	arrayBufferToBase64,
	base64ToArrayBuffer,
	ButtonComponent,
	Events,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
} from "obsidian";
import * as Y from "yjs";
import DiffMatchPatch from "diff-match-patch";
import { WebsocketProvider } from "y-websocket";

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
	events: AerosolEvents = new AerosolEvents();
	doc: Y.Doc;
	statusBarText: HTMLElement;
	dmp: DiffMatchPatch = new DiffMatchPatch();
	wsProvider: WebsocketProvider | null;
	ownUpdates: Set<string> = new Set();
	incomingUpdates: Set<string> = new Set();

	async onload() {
		// init

		await this.loadSettings();
		// add setting tab
		this.addSettingTab(new AerosolSettingTab(this.app, this));

		// load ydoc from localstorage
		this.loadDoc();

		if (this.settings.connected) {
			// setup websocket connection if possible
			this.wsProvider = new WebsocketProvider(
				"ws://" +
					this.settings.serverURL +
					":" +
					this.settings.serverPort,
				"aerosol-room",
				this.doc
			);
		}

		this.registerEvent(
			this.doc.on("update", (_) => {
				console.log("incoming update, applying changes");

				const filesMap = this.doc.getMap<Y.Map<any>>("files");
				filesMap.forEach(async (fileMap) => {
					const path = fileMap.get("path");
					const content: Y.Text = fileMap.get("content");
					const existingFile = this.app.vault.getFileByPath(path);
					if (existingFile) {
						const current = await this.app.vault.read(existingFile);
						if (current === content.toString()) return; // no change
						// update existing file
						if (this.ownUpdates.has(path)) {
							this.ownUpdates.delete(path);
							return; // skip processing if this was our own update
						}
						this.incomingUpdates.add(path);
						await this.app.vault.modify(
							existingFile,
							content.toString()
						);
					} else {
						this.incomingUpdates.add(path);
						await this.app.vault.create(path, content.toString());
					}
				});

				const trackedFiles = new Set();
				filesMap.forEach((fileMap) => {
					trackedFiles.add(fileMap.get("path"));
				});

				this.app.vault.getFiles().forEach(async (file) => {
					if (!trackedFiles.has(file.path)) {
						this.incomingUpdates.add(file.path);
						await this.app.vault.delete(file);
					}
				});
			})
		);

		// this.registerEvent(
		// 	this.wsProvider.on("status", this.updateConnectionStatus)
		// );

		// add status bar text
		this.statusBarText = this.addStatusBarItem();
		this.statusBarText.setText("Idle");

		// add status bar icon
		const statusBarIcon = this.addStatusBarItem();
		setIcon(statusBarIcon, "refresh-cw-off");

		// registering of sync events
		this.registerEvent(
			this.app.vault.on("create", async (file) => {
				if (this.incomingUpdates.has(file.path)) {
					this.incomingUpdates.delete(file.path);
					return; // skip processing if this was an incoming update
				}

				this.ownUpdates.add(file.path);

				this.statusBarText.setText("create " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// check if file already exists in map
					let alreadyTracked = false;
					map.forEach((v, k) => {
						if (v.get("path") === file.path) {
							alreadyTracked = true;
							return; // file already exists, do nothing
						}
					});
					if (alreadyTracked) return;

					// create a nested map for the file
					const fileMap = new Y.Map();
					fileMap.set("path", file.path);
					fileMap.set("content", new Y.Text());

					// add the new entry with a random id
					map.set(crypto.randomUUID(), fileMap);
				});
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				if (this.incomingUpdates.has(file.path)) {
					this.incomingUpdates.delete(file.path);
					return; // skip processing if this was an incoming update
				}

				this.ownUpdates.add(file.path);

				this.statusBarText.setText("delete " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// delete the entry with the matching path
					map.forEach((v, k) => {
						if (v.get("path") === file.path) {
							map.delete(k);
						}
					});
				});
			})
		);

		// // Currently not used, as changes are tracked via editor-change event
		// this.registerEvent(
		// 	this.app.vault.on("modify", async (file) => {
		// 		this.statusBarText.setText("modify " + file.path);
		// 	})
		// );

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				this.statusBarText.setText("rename " + file.path);
				this.doc.transact(() => {
					// get the file map
					const map = this.doc.getMap<Y.Map<any>>("files");

					// update the path in the map, while keeping content
					map.forEach((v, k) => {
						if (v.get("path") === oldPath) {
							v.set("path", file.path);
						}
					});
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, info) => {
				if (this.incomingUpdates.has(info.file?.path!)) {
					this.incomingUpdates.delete(info.file?.path!);
					return; // skip processing if this was an incoming update
				}

				this.ownUpdates.add(info.file?.path!);

				// get the file map
				const map = this.doc.getMap<Y.Map<any>>("files");

				// find corresponding ytext
				let ytext: Y.Text | null = null;
				for (const v of map.values()) {
					if (v.get("path") === info.file?.path) {
						ytext = v.get("content");
					}
				}

				if (ytext == null) return;

				// calculate diffs
				const newValue = editor.getValue();
				const oldValue = ytext.toString();

				const diffs = this.dmp.diff_main(oldValue, newValue);
				this.dmp.diff_cleanupEfficiency(diffs);

				// apply diffs
				this.doc.transact(() => {
					let index = 0;
					for (const [op, text] of diffs) {
						if (op === 0) {
							// equal, skip
							index += text.length;
						} else if (op === -1) {
							// deletion
							ytext.delete(index, text.length);
							// no index change because deletion removes characters at current position
						} else if (op === 1) {
							// insertion
							ytext.insert(index, text);
							index += text.length; // move past inserted text
						}
					}
				});
			})
		);
	}

	async onunload() {
		this.saveDoc();
		this.wsProvider?.disconnect();
		this.wsProvider?.destroy();
		this.wsProvider = null;
	}

	loadDoc() {
		this.doc = new Y.Doc();
		const stored = this.app.loadLocalStorage("ydoc");
		if (stored) {
			const update = new Uint8Array(base64ToArrayBuffer(stored));
			Y.applyUpdate(this.doc, update);
		}
	}
	saveDoc() {
		const update = Y.encodeStateAsUpdate(this.doc);
		this.app.saveLocalStorage(
			"ydoc",
			arrayBufferToBase64(update.buffer as ArrayBuffer)
		);
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

	updateConnectionStatus(event: {
		status: "connected" | "disconnected" | "connecting";
	}) {
		console.log("Connection status: " + event.status);
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
						// TODO: disconnect logic
						this.plugin.wsProvider?.disconnect();
						this.plugin.wsProvider?.destroy();
						this.plugin.wsProvider = null;
						this.plugin.settings.connected = false;
						await this.plugin.saveSettings();

						this.display();
					});
				});
		} else {
			new Setting(containerEl)
				.setName("Connect")
				.setDesc(
					"Connecting will setup your connection to the Server and begin syncing you data (THIS WILL DELETE ANY CURRENT FILES IN THE VAULT)"
				)
				.addButton((button: ButtonComponent) => {
					button.setIcon("log-in");
					button.onClick(async (event: MouseEvent) => {
						// TODO: connect logic
						// clear vault
						for (const file of this.plugin.app.vault.getFiles()) {
							await this.plugin.app.vault.delete(file);
						}

						// reset doc
						this.plugin.doc.destroy();
						this.plugin.doc = new Y.Doc();
						this.plugin.saveDoc();

						// setup websocket connection if possible
						if (
							this.plugin.settings.serverURL &&
							this.plugin.settings.serverPort
						)
							this.plugin.wsProvider = new WebsocketProvider(
								"ws://" +
									this.plugin.settings.serverURL +
									":" +
									this.plugin.settings.serverPort,
								"aerosol-room",
								this.plugin.doc
							);
						this.plugin.settings.connected = true;
						await this.plugin.saveSettings();

						this.display();
					});
				});
		}
	}
}
