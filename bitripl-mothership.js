const express = require('express')
//const bodyParser = require('body-parser')
const fs = require('fs');
const https = require('https');

//Constants
//-----------------------------------------------------------------------------

const mappingFilename = "./mappings.json"
const name = "bitripl-mothership"
const port = 9505

//Init
//-----------------------------------------------------------------------------

const app = express()
//var jsonParser = bodyParser.json()
var deviceToChannelMapping = JSON.parse(fs.readFileSync(mappingFilename, 'utf8'));

//API
//-----------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.writeHead(200, {"Content-Type": "application/json"});
    const data = {
      service: name
    }
    res.end(JSON.stringify(data));
  })

app.post('/', (req, res) => {

    contentType = req.get('Content-Type');
    if (contentType != "application/json") {
        res.status(400).send({"msg": "Unsupported 'Content-Type'.  Expecting application/json."}); 
        return;
    }

    deviceId = req.get('bitripl-device-id');
    if (deviceId == null) {
        res.status(400).send({"msg": "Missing header 'bitripl-device-id'"}); 
        return;
    }

    console.log(`Received data from ${deviceId}`)

    let body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();
        try {
            json = JSON.parse(body)
        }
        catch (e) {
            console.warn(" Invalid request body")
            res.status(400).send({"msg": "Invalid request body"});
            return;
        }
        try {
            channelInfos = lookupChannels(deviceId);
        }
        catch (e) {
          console.warn(` ${e}`)
          res.status(400).send({"msg": `${e}`});  
          return;
        }
        for (var i = 0; i < channelInfos.length; i++) {
          postToBitripl(channelInfos[i], body)
        }
        res.sendStatus(200);
    });

  });


//Helper functions
//-----------------------------------------------------------------------------

function lookupChannels(deviceId) {
    channelInfos = deviceToChannelMapping.filter(obj => obj.device_id == deviceId)
    if (!channelInfos.length) {
      throw "Unknown Device ID"
    }
    return channelInfos
}

function postToBitripl(channelInfo, data) {
    
    // An object of options to indicate where to post to
    var options = {
        host: 'www.bitripl.com',
        port: '443',
        path: `/api/accounts/${channelInfo.bitripl_account}/channels/${channelInfo.bitripl_channel}/data`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'bitripl-access-code': channelInfo.bitripl_access_code
        }
    };
    
    var post_req = https.request(options, function(res) {
          console.log(` Posting to ${channelInfo.bitripl_account}/${channelInfo.bitripl_channel}`)
          console.log(`  Response status code: ${res.statusCode}`)
          var data = [];
          res.on('data', (chunk) => {
              data.push(chunk);
          }).on('end', () => {
              data = Buffer.concat(data).toString();
              if (res.statusCode != 200){
                console.log(`   ${data}`)
              }
          })
      });

    // post the data
    post_req.write(data);
    post_req.end();
}


//Main
//-----------------------------------------------------------------------------

app.listen(port, () => console.log(`${name} listening on port ${port}!`))