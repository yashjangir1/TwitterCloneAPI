const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

/************************** API 1 *************************/

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const createUserQuery = `
            INSERT INTO
                user (name, username, password, gender)
            VALUES
                (
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            );`;

      await db.run(createUserQuery);
      response.send(`User created successfully`);
    }
  }
});

/*****************************  API 2 ************************/

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    const payload = {
      username: username,
    };
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/***************************** API 3 ***********************/

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const query3 = `
     SELECT user.username as username,
      tweet.tweet as tweet,
      tweet.date_time as dateTime
    FROM follower 
      INNER JOIN user on follower.following_user_id = user.user_id
      INNER JOIN tweet on user.user_id = tweet.user_id
    WHERE follower.follower_user_id = ${dbUser.user_id}
    ORDER By tweet.date_time desc
    LIMIT 4;
  `;

  const tweetsArr = await db.all(query3);
  response.send(tweetsArr);
});

/******************** API 4 *******************/

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const query4 = `
        SELECT
           user.name as name
        FROM 
            follower
        INNER JOIN 
            user ON follower.following_user_id = user.user_id
        WHERE 
            follower.follower_user_id = ${dbUser.user_id};
     `;

  const followingArr = await db.all(query4);
  response.send(followingArr);
});

/******************* API 5 *******************/

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const query5 = `
        SELECT 
           user.name as name
        FROM 
            follower
        INNER JOIN 
            user ON follower.follower_user_id = user.user_id
        WHERE 
            follower.following_user_id = ${dbUser.user_id};
     `;

  const followerArr = await db.all(query5);
  response.send(followerArr);
});

/************************ API 6 *********************/

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const tweetIdsQuery = `
      SELECT 
         tweet.tweet_id AS tweetId
      FROM
          tweet
      INNER JOIN 
          follower
      ON follower.following_user_id = tweet.user_id
      WHERE 
         follower.follower_user_id = ${dbUser.user_id}; 
  `;

  const tweetIds = await db.all(tweetIdsQuery);
  const tweetIdsArr = tweetIds.map((tweet) => tweet.tweetId);

  if (!tweetIdsArr.includes(parseInt(tweetId))) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetQuery = `
       SELECT 
          tweet
       FROM 
          tweet
       WHERE 
          tweet.tweet_id = ${tweetId};
    `;

    const tweet = await db.get(tweetQuery);

    const countLikesQuery = `
       SELECT 
          COUNT(like.like_id) AS likes
       FROM 
          like
       GROUP BY 
           tweet_id
       HAVING
           tweet_id = ${tweetId};
    `;

    const likeCount = await db.get(countLikesQuery);

    const replyLikesQuery = `
       SELECT 
          COUNT(reply.reply_id) AS replies
       FROM 
          reply
       GROUP BY 
           tweet_id
       HAVING
           tweet_id = ${tweetId};
    `;

    const replyCount = await db.get(replyLikesQuery);

    const dateTimeQuery = `
      SELECT 
          date_time AS dateTime
       FROM 
          tweet
       WHERE 
          tweet.tweet_id = ${tweetId};
    `;

    const dateTimeA = await db.get(dateTimeQuery);

    response.send({
      tweet: tweet.tweet,
      likes: likeCount.likes,
      replies: replyCount.replies,
      dateTime: dateTimeA.dateTime,
    });
  }
});

/************************* API 7 **********************/

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserQuery = `
            SELECT *
            FROM user
            WHERE username = '${username}';`;
    const dbUser = await db.get(getUserQuery);

    const tweetIdsQuery = `
      SELECT 
         tweet.tweet_id AS tweetId
      FROM
          tweet
      INNER JOIN 
          follower
      ON follower.following_user_id = tweet.user_id
      WHERE 
         follower.follower_user_id = ${dbUser.user_id}; 
  `;

    const tweetIds = await db.all(tweetIdsQuery);
    const tweetIdsArr = tweetIds.map((tweet) => tweet.tweetId);

    if (!tweetIdsArr.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesIdsQuery = `
         SELECT 
            user.username AS name
         FROM 
            like 
          INNER JOIN user ON like.user_id = user.user_id
         GROUP BY
            like_id
         HAVING
            like.tweet_id = ${tweetId};
      `;

      const likeNamesArr = await db.all(likesIdsQuery);
      const likesArr = likeNamesArr.map((like) => like.name);

      response.send({
        likes: likesArr,
      });
    }
  }
);

/************************* API 8 **********************/

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserQuery = `
            SELECT *
            FROM user
            WHERE username = '${username}';`;
    const dbUser = await db.get(getUserQuery);

    const tweetIdsQuery = `
      SELECT 
         tweet.tweet_id AS tweetId
      FROM
          tweet
      INNER JOIN 
          follower
      ON follower.following_user_id = tweet.user_id
      WHERE 
         follower.follower_user_id = ${dbUser.user_id}; 
  `;

    const tweetIds = await db.all(tweetIdsQuery);
    const tweetIdsArr = tweetIds.map((tweet) => tweet.tweetId);

    if (!tweetIdsArr.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const repliesIdsQuery = `
         SELECT 
            user.name AS name,
            reply.reply AS reply
         FROM 
            reply 
          INNER JOIN user ON reply.user_id = user.user_id
         GROUP BY
            reply_id
         HAVING
            reply.tweet_id = ${tweetId};
      `;

      const replyNamesArr = await db.all(repliesIdsQuery);

      response.send({
        replies: replyNamesArr,
      });
    }
  }
);

/************************* API 9 **********************/

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getUserQuery = `
            SELECT *
            FROM user
            WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const query9 = `
    SELECT 
       tweet.tweet AS tweet,
       COUNT(DISTINCT like.like_id) AS likes,
       COUNT(DISTINCT reply.reply_id) AS replies,
       tweet.date_time AS dateTime
    FROM 
       tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
       INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    GROUP BY 
       tweet.tweet_id
    HAVING
       tweet.user_id = ${dbUser.user_id};
  `;

  const tweetsArr = await db.all(query9);
  response.send(tweetsArr);
});

/************************* API 10 **********************/

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  let { username } = request;

  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const query10 = `
    INSERT INTO
       tweet(tweet, user_id, date_time)
    VALUES(
       '${tweet}',
       ${dbUser.user_id},
       '${new Date()}'
    )
  `;

  await db.run(query10);
  response.send("Created a Tweet");
});

/************************* API 11 **********************/

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;

    const getUserQuery = `
            SELECT *
            FROM user
            WHERE username = '${username}';`;
    const dbUser = await db.get(getUserQuery);

    const tweetIdsQuery = `
      SELECT 
         tweet.tweet_id AS tweetId
      FROM
          tweet
      WHERE 
         tweet.user_id = ${dbUser.user_id}; 
  `;

    const tweetIds = await db.all(tweetIdsQuery);
    const tweetIdsArr = tweetIds.map((tweet) => tweet.tweetId);

    if (!tweetIdsArr.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query11 = `
          DELETE FROM
            tweet
          WHERE
             tweet.tweet_id = ${tweetId};
       `;

      await db.run(query11);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
