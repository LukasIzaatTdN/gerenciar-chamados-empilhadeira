function claimGatewayNonceFirestore_(nonce, timestamp) {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce) || !Number.isSafeInteger(timestamp) || timestamp < 0) throw Error('Invalid nonce');
  var url = 'https://firestore.googleapis.com/v1/projects/painel-772bf/databases/(default)/documents/push_gateway_nonces?documentId=' + encodeURIComponent(nonce);
  var response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({fields: {signed_at: {timestampValue: new Date(timestamp).toISOString()}}}),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status === 200 || status === 201) return true;
  if (status === 409) return false;
  throw Error('Replay claim failed: HTTP ' + status);
}
