var moment = require('moment-timezone');
var request = require('request');
var fs = require('file-system');
var webhooks; // this should be an array of webhooks
var htmlparser = require("htmlparser2");
var THUMBNAIL_URL = ""; // thumbnail url holder
var DESC_TEXT = ""; // description text holder
var PRINT_TEXT = true; // trigger for saving description text
var LINK_TEXT= false;
var parser = new htmlparser.Parser({
  /*
    Here we are parsing the HTML.  
    We find a jpg URL for a 'full' (non-thumb) image
    We exclude any text that has a 'heading size' (is surrounded by font: size 3 tags) and append anything else.
  */
  onopentag: function(name, attribs){
    if  (!attribs.href) { return }
    var re = /^http.*(?!.*?thumb).*\.jpg/; // this will match anything that ends in jpg and does not containt a /thumb/ in the url
    if (name === "a" && attribs.href.match(re)){
          THUMBNAIL_URL = THUMBNAIL_URL || attribs.href; // save the link if it does not exist
          LINK_TEXT = true; 
    } 
    else if (name === "img" && attribs.src.match(re)) {
      THUMBNAIL_URL = THUMBNAIL_URL || attribs.src;
    }
    else if (name === "font") { 
      PRINT_TEXT = false; // do not save into descrption if we are changing the font size
    }
    else if ( name == "a") {
      LINK_TEXT = true;
    }
    //console.log(name, attribs)
  },
  ontext: function(text){
    if (PRINT_TEXT && ! LINK_TEXT) { // if we are allowed to print text
      if (DESC_TEXT.length < 200 && text.replace(/\s+/g, "")) { // if our current string is less than 400 characters and the text is not empty
        DESC_TEXT += text; // append to the description string.
      }
    }
    //console.log("--->",text)
  },
  onclosetag: function(tagname){
    if (tagname === "font")  {
          PRINT_TEXT = true; // allow the saving of the description string
    } 
    else if (tagname === "a") {
      LINK_TEXT = false
    }
    //console.log(tagname)
  }
}, {decodeEntities: true});

//#### Swap between these for 'testing'.  Subtract can be used to force a webhook post at bot start up since it will use the newest.
//var lastPost = moment().subtract(1, 'year').format(); // set the bottime to a year ago so that ti will post the newest article, then set its new 'lastPost time'
var lastPost = moment().format(); // set the bot start time to now so we only see posts after the start up
//#### 

// set the rss feed to poll as well as the intraval in seconds.
var poll = require('feed-poll')(
[ "http://www.mmo-champion.com/external.php?do=rss&type=newcontent&sectionid=1&days=120&count=10",
], 5);

//var webhooks = ["https://discordapp.com/api/webhooks/370374279470120960/zh2KTJfUoYsXG3A5JUF2gcdL9JgNSvj1Dov_2JfKdrT8w5XAi4Bv37Xt2i4hvnkNKzhp",]

poll.on("cycle", function() {
  // for every polling cycle, read the webhooks file to build our array of hooks.
  fs.readFile('webhooks', function(err, data) {
    if(err) throw err;
    webhooks = data.toString().split("\n");
    //print all webhooks.
    // for(i in webhooks) {
    //     console.log(webhooks[i]);
    // }
  });
  console.log(lastPost)
  //reset the image and description every cycle
  THUMBNAIL_URL = "";
  DESC_TEXT = "";
});

//on each article that we find ( this actually will only ever pull info from the 'newest' article)
// As the poller cycles, it removes the oldest post.
poll.on("article", function(article) {
  var pubDate = moment(article.published); // save the publish date in a readble time format.
  //console.log(article)
  parser.write(article.content); // parse the html content of the post.
  parser.end(); // stop parsing
  if (pubDate.diff(lastPost, 'seconds') >= 0) {
    // if the publish date is newer than the last post, then set the lastPost date to now.
    lastPost = moment().format();
    //THUMBNAIL_URL = THUMBNAIL_URL.replace(/^\/\//g, "http://")
    console.log("Sending new post: " + article.title);
    console.log("Article Link: " + article.link)
    console.log("THUMBNAIL_URL: " + THUMBNAIL_URL);
    console.log("Description: " + DESC_TEXT)
    for (var hook in webhooks) {
      var currHook = webhooks[hook]; // get the current webhook to send to
      if (! currHook) { continue; } // if the line is empty, skip it.
      console.log("currhook: " + currHook)
      //POST THE webhook
      //curl -X POST --data '{ "embeds": [{"title": "Topic Title", "url": "https://example.com", "description": "This is a test for webhooks", "type": "link", "thumbnail": {"url": "https://meta-s3-cdn.freetls.fastly.net/original/3X/c/b/cb4bec8901221d4a646e45e1fa03db3a65e17f59.png"}}] }' -H "Content-Type: application/json"  https://canary.discordapp.com/api/webhooks/url
      var data = {
        "username": "MMO-Champion",
        "avatar_url": "http://static.mmo-champion.com/images/tranquilizing/logo.png",
        "embeds": [{
          "title": article.title,
          "description": DESC_TEXT.replace(/\s+/g, " ").replace(/Originally Posted by Blizzard \(Blue Tracker\) /g, ""), // remove any 'excess' whitespace from between the text, as well as remove the 'blue tracker' info
          "url": article.link,
          "color": 1399932,
          "timestamp": moment().format(),
          "fields": [
            {
              "name": "Links",
              "value": "[Request this webhook](https://goo.gl/forms/S1mkG70XDU543KO23) | [Github](https://github.com/krazyito65/mmo-champion-rss-webhook)"
            }
          ],
          "footer": {
            "text": "This webook is in alpha. Contact Krazyito#1696"
          },
          "thumbnail": {
            "url": THUMBNAIL_URL//"http://static.mmo-champion.com/images/tranquilizing/logo.png"
          },
        }]
      }
      //send the payload to the webhook.
      request({
        url: currHook,
        method: "POST",
        body: data,
        json: true
      });
    }
  }
});


// start polling
poll.start();

//on poll errors, throw error.
poll.on("error", function(err) {
  console.error(err);
});
