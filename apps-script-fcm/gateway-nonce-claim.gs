function claimGatewayNonceFirestore_(nonce, timestamp) {
  if (!/^[0-9a-f-]{36}$/i.test(nonce) || !Number.isSafeInteger(timestamp)) throw Error('Invalid nonce');
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
