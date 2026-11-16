exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password_required: Boolean((process.env.APP_PASSWORD || "").trim())
    })
  };
};
