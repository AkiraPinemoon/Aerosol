import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import crypto, { UUID } from "crypto";

const regexFilePathForwardDashes = /^(\/[a-zA-Z0-9_\/-]+)*\.[a-zA-Z0-9]+$/;
const regexFilePathWindows =
  /^[a-zA-Z]:\\(?:[a-zA-Z0-9_\\-]+\\)*[a-zA-Z0-9_\\-]+\.[a-zA-Z0-9]+$/;

let DB: null | Database = null;

// Function to connect to Data Base
async function connectToDataBase(): Promise<Database> {
  if (DB) return DB;
  // const sql3 = sqlite3.verbose;
  try {
    // const DB = new sql3.Database('./mydata.db', sqlite3.OPEN_READWRITE);
    DB = await open({
      filename: "./mydata.db",
      driver: sqlite3.Database,
    });
    console.log("Connected to database taking mydata.db");
  } catch (err) {
    console.log("Unsuccessfull attempt connecting to database");
    throw err;
  }
  return DB;
}

/*
function hashValue(value, err) {
    if(typeof(value) == 'string' && value.length > 0){
        let hash = crypto.createHmac('md5', 'secret-hash-key');
        let update = hash.update(value);
        let hashedValue = update.digest('hex');
        return hashedValue;
    } else {
        console.log(err)
    }
}
*/

// Create the function for tables in database and returns true
async function initializeTables() {
  DB = await connectToDataBase();

  // Create table for checksums
  let sqlChecksum =
    "CREATE TABLE IF NOT EXISTS checksums(\
        path TEXT NOT NULL PRIMARY KEY,\
        hash CHAR(20) NOT NULL)";

  // Create table for the registration-token and date (format: YYYY-MM-DD)
  let sqlRegistrationTokens =
    "CREATE TABLE IF NOT EXISTS registration_tokens(\
        registration_token VARCHAR(255) PRIMARY KEY,\
        creation_date DATE)";

  // Create table for users. UUID is 128-bit integer
  let sqlUsers =
    "CREATE TABLE IF NOT EXISTS users(\
        user_UUID UUID NOT NULL PRIMARY KEY,\
        user_name VARCHAR(255) NOT NULL,\
        refresh_token_version INT)";

  try {
    await DB.run(sqlUsers, []);
    console.log("Created users table");
  } catch {
    console.log("Error creating users table");
  }
  try {
    await DB.run(sqlRegistrationTokens, []);
    console.log("Created users table");
  } catch {
    console.log("Error creating registration-tokens table");
  }
  try {
    await DB.run(sqlChecksum, []);
    console.log("Created checksums table");
  } catch {
    console.log("Error creating checksums table");
  }
  return true;
  /*
        DB.run(sqlRegistrationToken, [], (err)=>{
            if (err) {
                console.log('Error creating registration-tokens table');
                throw err;
            }
            console.log('Created registration-tokens');
        });
        DB.run(sqlChecksum, [], (err)=>{
            if (err) {
                console.log('Error creating checksums table');
                throw err;
            }
            console.log('Created checksums table');
        });
    finally {
        DB.close(()=> {
            console.log('Database has been closed')
        });
    }
    */
}

// Takes a username, creates a new user-entry in Users and returns the UUID
async function newUser(userName: string) {
  DB = await connectToDataBase();
  const sql =
    "INSERT INTO users(user_UUID, user_name, refresh_token_version)\
        VALUES(?, ?, ?)";
  const randomUUIDDashed = crypto.randomUUID();
  const userUUID = randomUUIDDashed.replaceAll("-", "");
  try {
    if (typeof userName == "string" && userName.length > 0) {
      try {
        await DB.run(sql, [userUUID, userName, "1"]);
        console.log(
          "Added " +
            userName +
            " with the UUID " +
            userUUID +
            " to the table users"
        );
        return userUUID;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      // Invalid username format
      console.log("Invalid username format");
    }
  } catch (err: any) {
    console.log(err.message);
  }
}

// Takes a UUID and returns the Version of the RefreshToken
async function getRefreshTokenVersion(userUUID: UUID) {
  DB = await connectToDataBase();
  const sql =
    "SELECT refresh_token_version\
        FROM users\
        WHERE user_UUID = ?";
  try {
    if (typeof userUUID == "string" && userUUID.length == 32) {
      try {
        const refreshTokenVersion = await DB.get(sql, [userUUID]);
        return refreshTokenVersion.refresh_token_version;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      console.log("Invalid UUID format: string, length == 32");
      return null;
    }
  } catch (err) {
    console.log(err);
    return err;
  }
}

// Takes a UUID, increments the Version of the Refresh-Token by 1 and returns the new Version
async function updateRefreshTokenVersion(userUUID: UUID) {
  DB = await connectToDataBase();
  const sql =
    "UPDATE users\
        SET refresh_token_version = refresh_token_version + 1\
        WHERE user_UUID = ?";
  try {
    if (typeof userUUID == "string" && userUUID.length == 32) {
      try {
        const updatedRefreshTokenVersion = await DB.run(sql, [userUUID]);
        console.log(
          "The Version of the Refresh-Token associated with " +
            userUUID +
            " was updated to " +
            updatedRefreshTokenVersion
        );
        return await getRefreshTokenVersion(userUUID);
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      console.log("Not a valid UUID format: string, length == 32");
      return null;
    }
  } catch (err) {
    console.log(err);
    return null;
  }
}

// Takes a UUID and returns the username for the given UUID
async function getUserName(userUUID: UUID) {
  DB = await connectToDataBase();
  const sql =
    "SELECT user_name\
        FROM users\
        WHERE user_UUID = ?";
  try {
    if (typeof userUUID == "string" && userUUID.length == 32) {
      try {
        const username = await DB.get(sql, [userUUID]);
        console.log(
          "The username of the UUID " + userUUID + " is " + username.user_name
        );
        return username.user_name;
      } catch (err: any) {
        console.log(err.message);
      }
    } else {
      console.log("Invalid UUID format");
      return null;
    }
  } catch (err) {
    console.log(err);
    return null;
  }
}

// Takes a UUID and a username and inserts the username for the given UUID
async function updateUserName(userUUID: UUID, userName: string) {
  DB = await connectToDataBase();
  const sql =
    "UPDATE users\
        SET user_name = ?\
        WHERE user_UUID = ?";
  try {
    if (typeof userUUID == "string" && userUUID.length == 32) {
      if (typeof userName == "string" && userName.length > 0) {
        try {
          await DB.run(sql, [userName, userUUID]);
          console.log(
            "The username associated to the UUID " +
              userUUID +
              " was changed to " +
              userName
          );
          return;
        } catch (err: any) {
          console.log(err.message);
          return null;
        }
      } else {
        console.log("Invalid username format: string, not empty");
        return null;
      }
    } else {
      console.log("Invalid UUID format: string, length == 32");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
    return null;
  }
}

// Takes a UUID and deletes the User-Entry associated to that UUID
async function deleteUserEntry(userUUID: UUID) {
  DB = await connectToDataBase();
  const sql =
    "DELETE FROM users\
        WHERE user_UUID = ?";
  try {
    if (typeof userUUID == "string" && userUUID.length == 32) {
      const change = await DB.run(sql, [userUUID]);
      if (change.changes == 1) {
        console.log(
          "The entry behind the UUID " + userUUID + " was successfully deleted"
        );
        return;
      } else {
        console.log("No entry with the UUID " + userUUID + " was found");
        return null;
      }
    } else {
      console.log("Invalid UUID format: string, length == 32");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
  }
}

// Takes a registration token, creates an entry in the table registration_tokens and returns True if the entry of successful
async function newRegistrationToken(registrationToken: string) {
  DB = await connectToDataBase();
  const sql =
    "INSERT INTO registration_tokens(registration_token, creation_date)\
        VALUES(?, DATE('now'))";
  try {
    if (
      true /*insert some type of format checking for the registrationtoken*/
    ) {
      try {
        const registrationTokenRow = await DB.run(sql, [registrationToken]);
        console.log(
          "The Registration-Token " +
            registrationToken +
            " was entered into the database at "
        );
        return;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      // Invalid token format
      console.log("Invalid token format");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
    return null;
  }
}

// Take a Registration-Token, deletes the entry and returns true
async function deleteRegistrationToken(registrationToken: string) {
  DB = await connectToDataBase();
  const sql =
    "DELETE FROM registration_tokens\
        WHERE registration_token = ?";
  try {
    if (true /*insert format checking for registration token*/) {
      try {
        const deleteRegToken = await DB.run(sql, [registrationToken]);
        console.log(
          "The Registration-Token " +
            registrationToken +
            " was successfully deleted from registration_tokens"
        );
        return deleteRegToken;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      // Invalid format
      console.log("Invalid Registration-Token format");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
  }
}

// Take a File-Path (JS-string-format), create a Hash, create a new file-entry in Checksum and return
async function newFile(filePath: string, hash: string) {
  DB = await connectToDataBase();
  const sql =
    "INSERT INTO checksums(path, hash)\
        VALUES(?, ?)";
  try {
    if (
      regexFilePathForwardDashes.test(filePath) ||
      regexFilePathWindows.test(filePath)
    ) {
      if (true /* insert hash format condition ... && ()*/) {
        try {
          await DB.run(sql, [filePath, hash]);
          console.log("Added " + filePath + " with " + hash + " to checksums");
          return;
        } catch (err: any) {
          console.log(err.message);
          return null;
        }
      } else {
        console.log("Invalid hash format");
        return null;
      }
    } else {
      console.log("Invalid path format");
      return null;
    }
  } catch (err) {
    return err;
  }
}

// Take a File-Path and return the hash for it
async function getFileHash(filePath: string) {
  DB = await connectToDataBase();
  const sql =
    "SELECT hash\
        FROM checksums\
        WHERE path = ?";
  try {
    if (
      regexFilePathForwardDashes.test(filePath) ||
      regexFilePathWindows.test(filePath)
    ) {
      try {
        const hash = await DB.get(sql, [filePath]);
        return hash.hash;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      console.log("Invalid path format");
      return null;
    }
  } catch (err) {
    console.log(err);
    return err;
  }
}

// Take a File-Path, delete the Entry for that file and return true
async function deleteFile(filePath: string) {
  DB = await connectToDataBase();
  const sql =
    "DELETE FROM checksums\
        WHERE path = ?";
  try {
    if (
      regexFilePathForwardDashes.test(filePath) ||
      regexFilePathWindows.test(filePath)
    ) {
      try {
        const change = await DB.run(sql, [filePath]);
        if (change.changes == 1) {
          console.log(
            "The entry with the UUID " + filePath + " was successfully deleted"
          );
          return;
        } else {
          console.log("No entry with the path " + filePath + " was found");
          return null;
        }
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      // Invalid format
      console.log("Invalid path format");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
  }
}

// Take the current path, the new one and return the newFilePath
async function updateFilePath(oldFilePath: string, newFilePath: string) {
  DB = await connectToDataBase();
  const sql =
    "UPDATE checksums\
        SET path = ?\
        WHERE path = ?";
  try {
    if (
      (regexFilePathForwardDashes.test(oldFilePath) ||
        regexFilePathWindows.test(oldFilePath)) &&
      (regexFilePathForwardDashes.test(newFilePath) ||
        regexFilePathWindows.test(newFilePath))
    ) {
      try {
        await DB.run(sql, [oldFilePath, newFilePath]);
        console.log(
          "The path of " + oldFilePath + " was changed to " + newFilePath
        );
        return;
      } catch (err: any) {
        console.log(err.message);
        return null;
      }
    } else {
      console.log("Invalid path format");
      return null;
    }
  } catch (err: any) {
    console.log(err.message);
    return null;
  }
}

export default {
  initializeTables,
  newUser,
  updateUserName,
  getUserName,
  deleteUserEntry,
  getRefreshTokenVersion,
  updateRefreshTokenVersion,
  newRegistrationToken,
  deleteRegistrationToken,
  newFile,
  getFileHash,
  deleteFile,
  updateFilePath,
};
