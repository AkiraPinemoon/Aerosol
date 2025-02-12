import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import cors from "cors";
import checksums from "./checksums";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
import swaggerUi from "swagger-ui-express";
import yaml from "yamljs";

const vault_path = process.env.VAULT_PATH || "vault";
const swaggerDocument = yaml.load("../openapi3_1.yaml");

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
  const access_jwt = req.get("Authorization");
  if (!access_jwt) {
    res.sendStatus(401);
    return;
  }

  // access token auth

  if (!req.query.filename) {
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }

  // decode filename with atob(req.query.filename)?
  fs.stat(`${vault_path}/${req.query.filename}`, (err, stats) => {
    if (err) {
      res.statusCode = 404;
      res.statusMessage = `The filename \"${req.query.filename}\" could not be found on the server. Details: ${err}`;
      res.send();
      return;
    }
    fs.readFile(`${vault_path}/${req.query.filename}`, "utf-8", (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.statusMessage = `Error while reading: ${err}`;
        res.send();
        return;
      }
      res.send({ contents: btoa(data) });
    });
  });
});

app.put("/file", (req: Request, res: Response) => {
  const access_jwt = req.get("Authorization");
  if (!access_jwt) {
    res.sendStatus(401);
    return;
  }

  // access token auth

  if (!req.body.filename) {
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.body.filename}`;
    res.send();
    return;
  }

  fs.writeFile(
    `${vault_path}/${req.body.filename}`,
    atob(req.body.contents),
    (err) => {
      if (err) {
        res.statusCode = 500;
        res.statusMessage = `Error while writing: ${err}`;
        res.send();
        return;
      }
      res.sendStatus(200);
    }
  );
});

app.delete("/file", (req: Request, res: Response) => {
  const access_jwt = req.get("Authorization");
  if (!access_jwt) {
    res.sendStatus(401);
    return;
  }

  // access token auth

  if (!req.query.filename) {
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`, (err, stats) => {
    if (err) {
      res.statusCode = 404;
      res.statusMessage = `The filename \"${req.query.filename}\" could not be found on the server. Details: ${err}`;
      res.send();
      return;
    }
    fs.unlink(`${vault_path}/${req.query.filename}`, (err) => {
      if (err) {
        res.statusCode = 500;
        res.statusMessage = `Error while deleting: ${err}`;
        res.send();
        return;
      }
      res.sendStatus(200);
    });
  });
});

app.patch("/file", (req: Request, res: Response) => {
  const access_jwt = req.get("Authorization");
  if (!access_jwt) {
    res.sendStatus(401);
    return;
  }

  // access token auth

  if (!req.query.filename) {
    res.statusCode = 400;
    res.statusMessage = `filename is ${req.query.filename}`;
    return;
  }
  if (!req.query.newFilename) {
    res.statusCode = 400;
    res.statusMessage = `newFilename is ${req.query.newFilename}`;
    return;
  }

  fs.stat(`${vault_path}/${req.query.filename}`, (err, stats) => {
    if (err) {
      res.statusCode = 404;
      res.statusMessage = `The filename \"${req.query.filename}\" could not be found on the server. Details: ${err}`;
      res.send();
      return;
    }
    fs.stat(`${vault_path}/${req.query.newFilename}`, (err, stats) => {
      if (!err) {
        res.statusCode = 400;
        res.statusMessage = `The new filename \"${req.query.newFilename}\" already exists. Details: ${stats}`;
        res.send();
        return;
      }
      fs.rename(
        `${vault_path}/${req.query.filename}`,
        `${vault_path}/${req.query.newFilename}`,
        (err) => {
          if (err) {
            res.statusCode = 500;
            res.statusMessage = `Error while renaming: ${err}`;
            res.send();
            return;
          }
          res.sendStatus(200);
        }
      );
    });
  });
});

app.get("/checksum", (req: Request, res: Response) => {
  const access_jwt = req.get("Authorization");
  if (!access_jwt) {
    res.sendStatus(401);
    return;
  }

  // access token auth

  if (!req.query.filename) {
    // vault checksum
    res.send("this would be checksum of vault");
    return;
  }

  // file checksum
  fs.stat(`${vault_path}/${req.query.filename}`, (err, stats) => {
    if (err) {
      res.statusCode = 404;
      res.statusMessage = `The filename \"${req.query.filename}\" could not be found on the server. Details: ${err}`;
      res.send();
      return;
    }

    res.send(`this would be checksum of ${req.query.filename}`);
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
  // (registration-)token check
  // create username and generate and return refresh jwt
  res.setHeader("Authorization", "test refreshToken");
  res.end();
});

app.get("/user", (req: Request, res: Response) => {
  const refresh_jwt = req.get("Authorization");
  if (!refresh_jwt) {
    res.sendStatus(401);
    return;
  }

  // check refresh jwt
  // generate and return access/exit jwt
  res.setHeader("Authorization", "test accessToken");
  res.send({ expiresIn: 60 });
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
