const jwt = require("jsonwebtoken");
const signing_key = process.env.SIGNING_KEY || "what here?";

function checkAccess(access_jwt: string | null | undefined, source: string): boolean {
  if (!access_jwt) {
    console.error(`${source}: access_token is ${access_jwt}`);
    return false;
  }
  try
  {
    // swagger adds "Bearer "-prefix to auth header
    jwt.verify(access_jwt.substring(7), signing_key);
  }
  catch (e) {
    console.error(`${source}: ${e}`);
    return false;
  }
  return true;
}

// https://stackoverflow.com/a/1349426
function makeid(length: number): string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

export default {
    checkAccess,
    makeid
}