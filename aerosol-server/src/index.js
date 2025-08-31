import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import ws from "ws";

const doc = new Y.Doc();

const wsProvider = new WebsocketProvider(
  "ws://localhost:1234",
  "aerosol-room",
  doc,
  { WebSocketPolyfill: ws }
);

doc.on("update", () => {
  const files = doc.getMap("files");
  console.log("==== Current files ====");
  files.forEach((value, key) => {
    value.forEach((contentValue, contentKey) => {
      console.log(`  ${contentKey}: ${contentValue}`);
    });
  });
});

wsProvider.awareness.on("update", ({ added, updated, removed }) => {
  const states = wsProvider.awareness.getStates();
  added.forEach((clientID) => {
    console.log("Client connected:", clientID, states.get(clientID));
  });
  updated.forEach((clientID) => {
    console.log("Client updated:", clientID, states.get(clientID));
  });
  removed.forEach((clientID) => {
    console.log("Client disconnected:", clientID);
  });
});

console.log("Aerosol server is running on ws://localhost:1234");
