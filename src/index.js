import Printer from "node-printer";
import { Client } from "whatsapp-web.js";
import QRCode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import { Buffer } from "node:buffer";
import fs from "node:fs";

const mimeTypesAllowed = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const fileExtensions = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

const maxMBSizeAllowed = 10;

const { LocalAuth } = pkg;

const whatsAppClient = new Client({
  authStrategy: new LocalAuth(),
});

let printers = [];
let printer = null;

let reactionListeners = {};

whatsAppClient.on("qr", (qr) => {
  QRCode.generate(qr, { small: true });
});

whatsAppClient.on("ready", () => {
  console.log("✅ WhatsApp client is ready!");
  printers = Printer.list();
  console.log("Printers available =>", printers);
  printer = new Printer("Brother_DCP_T510W");
});

whatsAppClient.on("message_reaction", (msg) => {
  const messageId = msg.msgId.id?.toString();

  const reactionListener = reactionListeners[messageId];

  if (reactionListener) {
    reactionListener(msg);
  }
});

whatsAppClient.on("message", async (msg) => {
  if (msg?.hasMedia && !msg.isStatus && printer) {
    const messageId = msg.id.id?.toString();

    const media = await msg.downloadMedia();

    if (media) {
      const mimeTypeIsAllowed = mimeTypesAllowed.includes(media.mimetype);

      if (mimeTypeIsAllowed) {
        const filesize = media.filesize / 1000 / 1000;

        if (filesize <= maxMBSizeAllowed) {
          const binaryData = Buffer.from(media.data, "base64");

          const tempFilesPath = "./uploads";

          const tempFilename = `temp_file_${Date.now()}.${
            fileExtensions[media.mimetype]
          }`;

          fs.writeFile(
            `${tempFilesPath}/${tempFilename}`,
            binaryData,
            async (err) => {
              if (err) {
                return console.log(
                  `Error saving the file ${tempFilename}: `,
                  err.message
                );
              }

              console.log(`File ${tempFilename} saved!`);

              reactionListeners[messageId] = (reply) => {
                if (reply.reaction === "👍") {
                  console.log(`Printing file: ${tempFilename}`);

                  const printerOptions = {
                    media: "a4",
                    fitplot: true,
                    scaling: 100,
                  };

                  const fileBuffer = fs.readFileSync(
                    `${tempFilesPath}/${tempFilename}`
                  );

                  const printerJob = printer.printBuffer(
                    fileBuffer,
                    printerOptions
                  );

                  if (printerJob) {
                    printerJob.once("sent", () => {
                      printerJob.on("completed", () => {
                        console.log(`File ${tempFilename} has been printed!`);

                        printerJob.removeAllListeners();

                        fs.unlink(`${tempFilesPath}/${tempFilename}`, (err) => {
                          if (err) {
                            return console.error(
                              `Error deleting the file ${tempFilename}: ${err.message}`
                            );
                          }
                        });
                      });
                    });
                  }
                }
              };
            }
          );
        }
      }
    }
  }
});

whatsAppClient.initialize();
