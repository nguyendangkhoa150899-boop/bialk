export function dashboardAuth(req, res, next) {
  const expected = process.env.DASHBOARD_PASSWORD;
  const header = req.headers.authorization || "";
  const [, encoded] = header.split(" ");
  const decoded = encoded ? Buffer.from(encoded, "base64").toString() : "";
  const [, password] = decoded.split(":");

  if (password === expected) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Palworld Dashboard"');
  res.status(401).send("Authentication required");
}
