# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session

```
mongosh --eval "
use('osuweb');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  id: userId,
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  username: 'Test User',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  country: 'FR',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API

```
curl -X GET "https://<preview-url>/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

curl -X GET "https://<preview-url>/api/auth/me" \
  --cookie "session_token=YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing

```
await page.context.add_cookies([{
  "name": "session_token",
  "value": "YOUR_SESSION_TOKEN",
  "domain": "<preview-host>",
  "path": "/",
  "httpOnly": True,
  "secure": True,
  "sameSite": "None"
}]);
await page.goto("https://<preview-url>/solo");
```

## Checklist

- [ ] User document has `user_id` field (custom UUID)
- [ ] Session `user_id` matches user's `user_id` exactly
- [ ] All queries use `{"_id": 0}` projection
- [ ] `/api/auth/me` returns user data via cookie
- [ ] `/api/auth/me` returns user data via Authorization: Bearer
- [ ] Anonymous X-Client-Id flow still works when no cookie
- [ ] Solo profile card shows the Google username + picture when logged in

## Success

- ✅ `/api/auth/me` returns user data
- ✅ Solo page profile shows real name/picture
- ✅ CRUD operations (imports, scores) attributed to `user_id`

## Failure

- ❌ 401 Unauthorized after successful callback → check cookie flags (secure + sameSite=None) and CORS credentials
- ❌ User not found → check user_id matches between users + user_sessions collections
