// The Vue counterpart of ../app: CopilotKit's prebuilt Vue chat with static messages, no agent and no LLM.
//   ?theme=dark   puts `.dark` on <html>
//   ?lang=de      passes German strings through `labels`
import { createApp, h } from "vue";
import {
  CopilotKitProvider,
  CopilotChatConfigurationProvider,
  CopilotChatView,
  createA2UIMessageRenderer,
} from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";

const params = new URLSearchParams(location.search);
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
document.body.style.margin = "0";
document.body.style.background = params.get("theme") === "dark" ? "#212121" : "#ffffff";

const germanLabels = {
  chatInputPlaceholder: "Nachricht eingeben…",
  chatInputToolbarAddButtonLabel: "Anhänge hinzufügen",
  chatInputToolbarStartTranscribeButtonLabel: "Diktieren",
  chatDisclaimerText: "KI kann Fehler machen. Wichtige Informationen bitte prüfen.",
  welcomeMessageText: "Wie kann ich helfen?",
  // Keys that the fixes add; older versions ignore them.
  chatInputToolbarSendButtonLabel: "Nachricht senden",
  chatInputToolbarStopButtonLabel: "Stoppen",
  chatScrollToBottomLabel: "Nach unten scrollen",
  userMessageToolbarPreviousBranchLabel: "Vorherige Antwort",
  userMessageToolbarNextBranchLabel: "Nächste Antwort",
  reasoningMessageThinkingLabel: "Denkt nach…",
  chatInputSlashMenuLabel: "Befehle",
  chatInputSlashMenuEmptyText: "Keine Befehle gefunden",
  attachmentRemoveButtonLabel: "Anhang entfernen",
  attachmentPlayVideoButtonLabel: "Video abspielen",
  attachmentPreviewCloseButtonLabel: "Vorschau schließen",
};
const labels = params.get("lang") === "de" ? germanLabels : undefined;

const BASIC = "https://a2ui.org/specification/v0_9/basic_catalog.json";
const surface = {
  a2ui_operations: [
    { version: "v0.9", createSurface: { surfaceId: "pick", catalogId: BASIC } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "pick",
        components: [
          { id: "root", component: "Card", child: "body" },
          { id: "body", component: "Column", children: ["title", "hint", "choice", "go"] },
          { id: "title", component: "Text", text: "Pick a region", variant: "h3" },
          { id: "hint", component: "Text", text: "The report will use this region.", variant: "body" },
          {
            id: "choice",
            component: "ChoicePicker",
            displayStyle: "chips",
            options: [
              { label: "North", value: "north" },
              { label: "South", value: "south" },
            ],
            value: [],
          },
          { id: "go", component: "Button", child: "goLabel", action: { event: { name: "go" } } },
          { id: "goLabel", component: "Text", text: "Continue" },
        ],
      },
    },
  ],
};

const finished = [
  { id: "u1", role: "user", content: "Show me the regional report." },
  { id: "r1", role: "reasoning", content: "The user wants a report; ask for the region first." },
  { id: "a1", role: "assistant", content: "Which region should the report cover?" },
  { id: "s1", role: "activity", activityType: "a2ui-surface", content: surface },
];
const streaming = [
  { id: "u2", role: "user", content: "And the yearly totals?" },
  { id: "r2", role: "reasoning", content: "" },
];

const clip = {
  id: "clip",
  type: "video",
  source: { type: "data", value: "AAAA", mimeType: "video/mp4" },
  filename: "clip.mp4",
  status: "ready",
};

const noop = () => {};
const chat = (id, messages, isRunning, extras = {}) =>
  h(
    CopilotChatConfigurationProvider,
    { threadId: id, labels },
    {
      default: () =>
        h("section", { "data-testid": id, style: { height: "100%", minWidth: 0, flex: 1 } }, [
          h(CopilotChatView, {
            messages,
            isRunning,
            autoScroll: false,
            onSubmitMessage: noop,
            onStop: noop,
            onAddFile: noop,
            onStartTranscribe: noop,
            ...extras,
          }),
        ]),
    },
  );

const renderers = [createA2UIMessageRenderer({ theme: {} })];
createApp({
  render: () =>
    h(
      CopilotKitProvider,
      { runtimeUrl: "/no-runtime", enableInspector: false, renderActivityMessages: renderers },
      {
        default: () =>
          h("main", { style: { display: "flex", gap: "16px", height: "100vh" } }, [
            chat("finished", finished, false, {
              attachments: [clip],
              onRemoveAttachment: noop,
              inputToolsMenu: [{ label: "Export report", action: noop }],
            }),
            chat("streaming", streaming, true),
          ]),
      },
    ),
}).mount("#root");
