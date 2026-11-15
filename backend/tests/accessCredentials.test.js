const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanAccessCredentials } = require("../utils/accessCredentials");
const { buildAccessGrantedEmail } = require("../utils/email");

test("login details: optional, checked, cleaned", () => {
  assert.deepEqual(cleanAccessCredentials(undefined), { credentials: null });
  assert.deepEqual(cleanAccessCredentials({}), { credentials: null });
  assert.match(cleanAccessCredentials({ loginEmail: "nope", tempPassword: "x" }).error, /email/);
  assert.match(cleanAccessCredentials({ loginEmail: "a@b.co", tempPassword: "two\nlines" }).error, /one line/);
  assert.match(cleanAccessCredentials({ loginEmail: "a@b.co", loginUrl: "javascript:alert(1)" }).error, /https/);
  assert.deepEqual(
    cleanAccessCredentials({ loginEmail: " Asha@Example.com ", tempPassword: "Kp7mQx2Rta", loginUrl: "https://www.sanskritfromhome.org" }),
    { credentials: { loginEmail: "asha@example.com", tempPassword: "Kp7mQx2Rta", loginUrl: "https://www.sanskritfromhome.org/" } }
  );
});

test("access email: login box with the password; nothing without credentials", () => {
  const order = { _id: "o1" };
  const items = [{ name: "Spoken Sanskrit Course" }];
  const withLogin = buildAccessGrantedEmail(order, { name: "Asha" }, items, "Log in with your email.", {
    loginEmail: "asha@example.com",
    tempPassword: "Kp7mQx2Rta",
    loginUrl: "https://www.sanskritfromhome.org/"
  }).html;
  assert.ok(withLogin.includes("Your login details"));
  assert.ok(withLogin.includes("asha@example.com"));
  assert.ok(withLogin.includes("Kp7mQx2Rta"));
  assert.ok(withLogin.includes("change it after you first log in"));

  const existing = buildAccessGrantedEmail(order, { name: "Asha" }, items, "", {
    loginEmail: "asha@example.com",
    tempPassword: "",
    loginUrl: ""
  }).html;
  assert.ok(existing.includes("Your login details"));
  assert.ok(!existing.includes("temporary password"));

  const plain = buildAccessGrantedEmail(order, { name: "Asha" }, items, "Hello").html;
  assert.ok(!plain.includes("Your login details"));
});

test("login details are escaped in the email", () => {
  const html = buildAccessGrantedEmail({ _id: "o1" }, { name: "A" }, [], "", {
    loginEmail: "a@b.co",
    tempPassword: "<script>x</script>",
    loginUrl: ""
  }).html;
  assert.ok(!html.includes("<script>x</script>"));
});
