import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import cors from "cors";
import checksums from "./checksums";
import swaggerUi from "swagger-ui-express";
import yaml from "yamljs";
import db from "./db";
import auth from "./auth";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 27027;
const vault_path = process.env.VAULT_PATH || "vault";
const jwt = require("jsonwebtoken");
const signing_key = process.env.SIGNING_KEY || "what here?";
const signing_ttl = Number(process.env.SIGNING_TTL) || 60;
const swaggerDocument = yaml.load("../openapi3_1.yaml");

app.use(express.json());
app.use(express.urlencoded());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(
  cors({
    origin: ["app://obsidian.md"],
    exposedHeaders: ["Authorization"],
  })
);

app.use(express.urlencoded({ limit: process.env.FILE_UPLOAD_LIMIT }));
app.use(express.json({ limit: process.env.FILE_UPLOAD_LIMIT }));

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server");
});

app.get("/file", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/file GET")) {
    res.sendStatus(401);
    return;
  }

  // get file
  if (!req.query.filename) {
    console.error(`/file GET: filename is ${req.query.filename}`);
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    res.send();
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`).then((stats) => {
    fs.readFile(`${vault_path}/${req.query.filename}`, "utf-8").then((data) => {
      res.send({ contents: btoa(data) });
    }).catch((err) => {
      console.error(`/file GET: ${err}`);
      res.sendStatus(500);
    });
  }).catch((err) => {
    console.error(`/file GET: ${err}`);
    res.sendStatus(404);
  });
});

app.put("/file", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/file PUT")) {
    res.sendStatus(401);
    return;
  }

  if (!req.body.filename) {
    console.error(`/file PUT: filename is ${req.body.filename}`);
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.body.filename}`;
    res.send();
    return;
  }

  fs.writeFile(`${vault_path}/${req.body.filename}`, atob(req.body.contents)).then(() => {
    res.sendStatus(200)
  }).catch((err) => {
    console.error(`/file PUT: ${err}`);
    res.sendStatus(404);
  });
});

app.delete("/file", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/file DELETE")) {
    res.sendStatus(401);
    return;
  }

  if (!req.query.filename) {
    console.error(`/file DELETE: filename is ${req.query.filename}`);
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`).then((stats) => {
    fs.unlink(`${vault_path}/${req.query.filename}`).then(() => {
      res.sendStatus(200);
    }).catch((err) => {
      console.error(`/file DELETE: ${err}`);
      res.sendStatus(500);
    });
  }).catch((err) => {
    console.error(`/file DELETE: ${err}`);
    res.sendStatus(404);
  });
});

app.patch("/file", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/file PATCH")) {
    res.sendStatus(401);
    return;
  }

  if (!req.query.filename) {
    console.error(`/file PATCH: filename is ${req.query.filename}`);
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }
  if (!req.query.newFilename) {
    console.error(`/file PATCH: filename is ${req.query.newFilename}`);
    res.statusCode = 400;
    res.statusMessage = `newFilename is ${req.query.newFilename}`;
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`).then((stats) => {
    fs.stat(`${vault_path}/${req.query.newFilename}`).then((stats) => {
      console.error(`/file PATCH: The newFilename already exists: \"${req.query.newFilename}\"`);
      res.sendStatus(400);
    }).catch((err) => {
      fs.rename(`${vault_path}/${req.query.filename}`, `${vault_path}/${req.query.newFilename}`).then(() => {
        res.sendStatus(200);
      }).catch((err) => {
        console.error(`/file PATCH: ${err}`);
        res.sendStatus(500)
      });
    });
  }).catch((err) => {
    console.error(`/file PATCH: ${err}`);
    res.sendStatus(404);
  });
});

app.get("/checksum", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/checksum GET")) {
    res.sendStatus(401);
    return;
  }

  if (!req.query.filename) {
    // vault checksum
    res.send("this would be checksum of vault");
    return;
  }

  // file checksum
  fs.stat(`${vault_path}/${req.query.filename}`).then(() => {
    res.send(`this would be checksum of ${req.query.filename}`);
  }).catch((err) => {
    console.error(`/checksum GET: ${err}`);
    res.sendStatus(404);
  });
});

app.get("/checksums", (req: Request, res: Response) => {
  if (!auth.checkAccess(req.get("Authorization"), "/checksums GET")) {
    res.sendStatus(401);
    return;
  }

  if (!req.query.filename) {
    console.error(`/checksums GET: filename is ${req.query.filename}`);
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`).then(() => {
    res.send(`this would be checksums of ${req.query.filename}`);
  }).catch((err) => {
    console.error(`/checksum GET: ${err}`);
    res.sendStatus(404);
  });
});

app.post("/user", (req: Request, res: Response) => {
  if (!req.body.token) {
    res.statusCode = 400;
    res.statusMessage = `token is ${req.body.token}`;
    res.send();
    return;
  }
  if (!req.body.username) {
    res.statusCode = 400;
    res.statusMessage = `username is ${req.body.usrname}`;
    res.send();
    return;
  }

  db.deleteRegistrationToken(req.body.token).then((value) => {
    if (!value) {
      res.sendStatus(401);
      return;
    }
    db.newUser(req.body.username)
    .then((uuid) => {
      if (!uuid) {
        console.error(`/user POST: Returned uuid is ${uuid}`)
        res.sendStatus(500);
        return;
      }
  
      const token = jwt.sign({ name: req.body.username, uuid: uuid, version: 0 }, signing_key);
      res.setHeader("Authorization", token);
      res.send();
    })
    .catch((reason) => {
      console.error(`/user POST: ${reason}`)
      res.sendStatus(500);
    })
  });
});

app.get("/user", (req: Request, res: Response) => {
  const refresh_jwt = req.get("Authorization");
  let decoded;
  
  if (!refresh_jwt) {
    console.log(`/user GET: jwt is ${refresh_jwt}`);
    res.sendStatus(401);
    return;
  }
  try
  {
    // swagger adds "Bearer "-prefix to auth header
    decoded = jwt.verify(refresh_jwt!.substring(7), signing_key);
  }
  catch (e) {
    console.log(`/user GET: ${e}`);
    res.sendStatus(401);
    return;
  }

  db.getUserName(decoded.uuid).then((name) => {
    if (!name) {
      console.error(`/user GET: uuid \"${decoded.uuid}\" is invalid.`)
      res.sendStatus(401);
      return;
    }
  })

  // check decoded.version

  res.setHeader("Authorization", jwt.sign({ name: decoded.name, uuid: decoded.uuid, exp: Math.floor(Date.now() / 1000) + signing_ttl }, signing_key));
  res.send({ expiresIn: 60 });
});

app.post("/registrationToken", (req: Request, res: Response) => {
  if (!req.body.vaultName) {
    res.statusCode = 400;
    res.statusMessage = `vaultName is ${req.body.token}`;
    res.send();
    return;
  }
  if (!req.body.password) {
    res.statusCode = 400;
    res.statusMessage = `password is ${req.body.usrname}`;
    res.send();
    return;
  }

  // temp
  if (req.body.vaultName != "vault") {
    res.sendStatus(401);
    return;
  }
  if (req.body.password != "vault") {
    res.sendStatus(401);
    return;
  }

  const token = auth.makeid(5);
  db.newRegistrationToken(token);
  res.setHeader("Authorization", token);
  res.send();
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
