 They manage everything for you, just like any other managed database you may have used.

Create your database

Along with your free account, you also get an additional 25 USD of usage credit (at time of writing) each month to use after that.

Credit balance

“Free tier includes up to 30 million reads, 4.5 million writes and 40GB storage every month (up to $25 credit) Elastic and Pay As You Go for usage over free tier” Read more


If you would like to insert data, then you can update the query syntax to use the INSERT keyword, along with a set of parameters which help mitigate SQL injection attacks.

Batching of queries or commands is also supported, for example:

const queries = [
  {
    query: 'UPDATE user_profiles SET email=? WHERE key=?',
    params: [ emailAddress, 'hendrix' ]
  }, {
    query: 'INSERT INTO user_track (key, text, date) VALUES (?, ?, ?)',
    params: [ 'hendrix', 'Changed email', new Date() ]
  }
];

await client.batch(queries, { prepare: true });
console.log('Data updated on cluster');
You can find plenty of examples of how to use the driver in the npm module’s documentation.

Using the Astra DB Stargate API
One of the benefits of using Astra DB or the K8ssandra stack, is that Stargate makes a GraphQL and REST API available for any collections you have created at that point. There’s also a client library called “collections” that replicates the look and feel of a document database such as MongoDB. The collections wrapper for Astra DB doesn’t have all the features of a fully-fledged document database like MongoDB, for instance full text search is not available. Elasticsearch and Solr can be used in tandem with Astra DB for this purpose.

Let’s take a look at the collections library: @astrajs/collections.

I’ll be adapting the quick-start, and because we are now targeting Astra DB instead of Cassandra directly, we’ll need slightly different secrets for the connection.

Create a new function called “newsletter”, we’ll use it to input links that we want to send out to subscribers of our weekly newsletter on tech news.

The HTTP POST method will be used to submit an article, and the HTTP GET method will be used to retrieve the list of articles.

export OPENFAAS_PREFIX="alexellis"

faas-cli new --lang node14 \
  weekly-newsletter
We’ll need a mix of confidential and non-confidential configuration information for the function. You already have the Astra DB API token from a previous step saved in the astra-token file.

Open a browser, navigate to DataStax Astra DB.

Create a new keyspace called “functions” in the UI, then copy the Cluster ID of your database and the Database region, these are also available on the Connect page.

Now populate the weekly-newsletter.yml file with the following contents:

version: 1.0
provider:
  name: openfaas
  gateway: http://127.0.0.1:8080
functions:
  weekly-newsletter:
    lang: node14
    handler: ./weekly-newsletter
    image: alexellis/weekly-newsletter:0.0.1
    environment:
      ASTRA_DB_ID: 991f9b02-8fff-4d03-bc93-cfebbe1d41cc
      ASTRA_DB_REGION: eu-central-1
      ASTRA_DB_KEYSPACE: functions
    secrets:
    - astra-token
Note that the astra-token is considered confidential and must not be shared, for that reason we are creating it as a Kubernetes secret.

faas-cli secret create astra-token \
  --from-file astra-token --trim
Our JSON document will look like this, save it as sample.json:

{
    "added": "2021-07-09",
    "note": "Self-hosted tunnels for local development",
    "sent": false,
    "url": "https://docs.inlets.dev"
}
Create the handler.js file with the following contents:

'use strict'

const { createClient } = require("@astrajs/collections");
const fs = require("fs").promises

module.exports = async (event, context) => {
  let token = await fs.readFile("/var/openfaas/secrets/astra-token", "utf8")

  const astraClient = await createClient({
    astraDatabaseId: process.env.ASTRA_DB_ID,
    astraDatabaseRegion: process.env.ASTRA_DB_REGION,
    applicationToken: token.trim(),
  });

  // create a shortcut to the links in the ASTRA_DB_KEYSPACE keyspace
  const linksCollection = astraClient.
    namespace(process.env.ASTRA_DB_KEYSPACE).
    collection("links");

  if(event.method == "POST") {
    // application/json is parsed by default
    let newLink = event.body;
    const createdLink = await linksCollection.create(newLink);
    return context.
      status(200).
      succeed(createdLink);
  } else if(event.query.url) {
    try {
      let links = await linksCollection.find({ url: { $eq: event.query.url } });
      return context.
        status(200).
        succeed(links);
    } catch (err) {
      if(err.stack.includes("Request failed with status code 404")) {
        return context.
          status(200).
          succeed({});
      } else {
        console.error(err);
        return context.
          status(500).
          fail("Unable to query database");
      }
    }
  }

  let links;
  try {
    // Default with no url querystring
    links = await linksCollection.find({});
  } catch(err) {
    if(err.stack.includes("Request failed with status code 404")) {
      return context.
        status(200).
        succeed({});
    } else {
     console.error(err);
     return context.
      status(500).
      fail("Unable to query database");
    }
  }

  return context.
    status(200).
    succeed(links);
}
Note that when performing a find() operation with the Astra SDK, you will receive a 404 error if the collection hasn’t been created yet. Astra DB creates collections when the first record is inserted. In this instance, the function returns an empty set of results.

Now install the required npm module:

cd weekly-newsletter/
npm install --save @astrajs/collections
cd ../
And deploy the function:

faas-cli up -f weekly-newsletter.yml
There’s three ways to use the function:

1) Send a HTTP POST with a JSON body, containing a link to the article. 2) Access the root path to list all URLs that have been submitted. 3) Use the ?url= query parameter to fetch a specific URL.

As discussed earlier, we’ve added logic that will allow the function to return an empty set of links even when the collection doesn’t exist in Astra DB yet. You can try it with the following curl statement:

$ curl -s
 http://127.0.0.1:8080/function/weekly-newsletter | jq
{}
If you run into an error, just type in the following to check for a syntax error or issue with a secret:

faas-cli logs weekly-newsletter
If that shows nothing, but it still isn’t working, there’s a kubectl get events command we list in the OpenFaaS troubleshooting documentation that will more than likely pinpoint the issue.

In production, you’ll also want to add authentication to the submission endpoint. You can learn how with my Serverless For Everyone Else eBook listed at the end of the article. Here, I just want to focus on getting you connected and getting/putting documents into Astra DB.

Create a new link:

$ curl -s -H "Content-type: application/json" \
--data-binary @sample.json \
 http://127.0.0.1:8080/function/weekly-newsletter | jq

{
  "documentId": "116a5b7e-74f3-4abd-bac4-0b2e3e558930"
}
Note that the documentId is a unique key that can be used to retrieve the document later.

List all links:

$ curl -s \
  http://127.0.0.1:8080/function/weekly-newsletter | jq

{
  "116a5b7e-74f3-4abd-bac4-0b2e3e558930": {
    "added": "2021-07-09",
    "note": "Self-hosted tunnels for local development",
    "sent": false,
    "url": "https://docs.inlets.dev"
  },
}
Now let’s fetch a specific link by URL:

$ curl -s \
  "http://127.0.0.1:8080/function/weekly-newsletter?url=https://docs.inlets.dev" | jq
You will see the link from earlier.

Looking up the document by url is less efficient than by documentId, however it is more convenient and human readable.

If you’re interested, you can view the dynamic schema for the “links” collection via the CQL Console:

Dynamic fields

If you were using the traditional Cassandra Driver, you would have had to create your own links table manually, with something like the following:

use functions;

CREATE TABLE links (
  id UUID PRIMARY KEY,
  note text,
  added date,
  sent boolean,
  url text
);
With Astra DB’s Document API, we don’t have to write schemas, they are generated and can save time.

You can learn more about the Astra DB Collection library here.

Why not take things further? Add the ability to the function to look up the link from the documentId, and the ability to mark a link as sent using linksCollection.update().

Wrapping up
You can find the code examples from this article on GitHub: openfaas/astradb-openfaas. Feel free to fork the repository and adapt it to your own needs.

I’ve been learning about Cassandra and Astra DB for a few weeks now and feel much more comfortable understanding where to use it. The native Cassandra driver is convenient and means I can use a familiar SQL query language. The add-ons provided by Stargate bring additional options for: REST, Document access and GraphQL.

What about the cost? Datastax is calling this database a “Serverless database” because of consumption pricing coupled with the ability to scale out or down based on demand. All this is done without the user having to think about operations or server management.

The free credit coupled with not having to pay for idle means that many users will not be paying the usual 15-35 USD / month per database seen with other offerings.

Disclosure: Datastax is a client of OpenFaaS Ltd, this is a sponsored article but the opinions and views expressed are my own.

Here are some additional links for taking things further.

Get started with Astra DB
Stargate Data API Gateway
Document DB library for Astra DB and Node.js
Go deeper with OpenFaaS with Serverless for Everyone Else
Datastax has a series of live videos that they wanted to share with you, aimed at beginners.

Introduction to Apache Cassandra
Clone the Netflix UI with GraphQL, React and Astra DB
Build your own TikTok Clone with ReactJS and Netlify


<!-- ***** -->


REST stands for Representational State Transfer. The RESTful API style is a popular way of using standard HTTP commands like POST, PUT, GET, DELETE, and others to support exchange of data, using formats such as JSON. This style of interface promotes a clean separation between implementation of clients and servers.

The Stargate open source project provides an API layer that allows you to expose a REST API on top of any Cassandra database. When the Stargate REST API is added to an existing Cassandra deployment, it automatically creates HTTP endpoints that allow you to perform create, read, update, and delete (CRUD) operations on tables in your database. You can also create new database tables directly via the API.

Astra DB now offers offers a REST API via Stargate, which we explore in this scenario.

We'll use the Astra DB REST API to: