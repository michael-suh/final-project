require('dotenv/config');
const path = require('path');
const express = require('express');
const errorMiddleware = require('./error-middleware');
const uploadsMiddleware = require('./uploads-middleware');
const ClientError = require('./client-error');
const pg = require('pg');

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
const publicPath = path.join(__dirname, 'public');

if (process.env.NODE_ENV === 'development') {
  app.use(require('./dev-middleware')(publicPath));
}

const jsonMiddleware = express.json();

app.use(jsonMiddleware);

app.use(express.static(publicPath));

app.use(errorMiddleware);

app.listen(process.env.PORT, () => {
  process.stdout.write(`\n\napp listening on port ${process.env.PORT}\n\n`);
});

app.get('/api/items', (req, res, next) => {
  const sql = `
    select "itemId",
           "title",
           "price",
           "fileUrl",
           "userId",
           "content",
           "uploadedAt"
      from "items"
  `;

  db.query(sql)
    .then(result => {
      const items = result.rows;
      res.status(200).json(items);
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({
        error: 'An unexpected error occured.'
      });
    });

});

app.post('/api/uploads', uploadsMiddleware, (req, res, next) => {

  const { title, price, content, userId } = req.body;
  const fileUrl = `/images/${req.file.filename}`;
  const sql = `
    insert into "items" ("title", "price", "fileUrl", "userId", "content", "uploadedAt")
    values ($1, $2, $3, $4, $5, now())
    returning *
  `;

  const params = [title, price, fileUrl, userId, content];
  db.query(sql, params)
    .then(result => {
      const [file] = result.rows;
      res.status(201).json(file);
    })
    .catch(err => next(err));
});

app.get('/api/items/:itemId', (req, res, next) => {
  const itemId = Number(req.params.itemId);
  if (!itemId) {
    throw new ClientError(400, 'itemId must be a positive integer');
  }
  const sql = `
    select "itemId",
           "title",
           "price",
           "fileUrl",
           "users"."username",
           "content",
           "uploadedAt",
           "users"."location"
      from "items"
      join "users" using ("userId")
    where  "itemId" = $1
  `;
  const params = [itemId];
  db.query(sql, params)
    .then(result => {
      if (!result.rows[0]) {
        throw new ClientError(400, `cannot find item with itemId ${itemId}`);
      }
      res.json(result.rows[0]);
    })
    .catch(err => next(err));
});
