const express = require('express')
const fs = require('fs');
const https = require('https');
const jp = require('jsonpath');

//Constants
//-----------------------------------------------------------------------------

const mappingFilename = "./mappings.json"
const name = "bitripl-mothership"
const port = 9505

// Classes
//-----------------------------------------------------------------------------

class Point {
  constructor (data) {
    this.data = data;
    this.date = new Date();
  }
}

class Stream {
  constructor (channelInfo) {
    this.channelInfo = channelInfo;
    this.points = [];
    this.lastRelayDate = null;
    this.id = `${this.channelInfo.device_id}->${this.channelInfo.bitripl_account}/${this.channelInfo.bitripl_channel}`;
  }
  addPoint(point) {
    console.log(`  Point received on stream '${this.id}'`)
    this.points.push(point);

    //initialize lastRelayDate if necessary
    if (!this.lastRelayDate) {
      this.lastRelayDate = new Date();
    }
    
    var doRelay = this._checkRelay();
    if (doRelay) {
      var point = null;
      var bufferConfig = this._getBufferConfig();
      if (bufferConfig) {
        console.log("   Buffer interval reached.  Will aggregate and relay.")
        point = this._createAggregatePoint();
      }
      else {
        console.log("   No buffering configured for this stream.  Will relay directly.")
        point = this.points[this.points.length - 1];
      }      
      this._relay(point);
      this._curtailBuffer();
    }
    else {
      console.log(`   Buffering point. Current buffer size: ${this.points.length}`);
    }

  }
  _getBufferConfig() {
    if (!this.channelInfo.hasOwnProperty("buffer") || !this.channelInfo.buffer.hasOwnProperty("interval_seconds")) {
      return null; 
    }
    var bufferConfig = this.channelInfo.buffer;
    return bufferConfig;
  }
  _checkRelay() {
    var bufferConfig = this._getBufferConfig();
    //if buffering not requested, all points are flagged to go through as they arrive
    if (!bufferConfig) {
      return true;
    }
    
    var bufferIntervalSeconds = bufferConfig.interval_seconds;
    var latestPoint = this.points[this.points.length-1];
    var secondsSinceLastRelay = (latestPoint.date.getTime() - this.lastRelayDate.getTime()) / 1000;
    var doRelay = secondsSinceLastRelay >= bufferIntervalSeconds;
    return doRelay;
  }
  _curtailBuffer() {
    var bufferConfig = this._getBufferConfig();
    if (!bufferConfig) {
      this.points = [];
      return;
    }

    while (this.points.length > 0) {
      var point = this.points[0]; //get oldest point
      var ageSeconds = this.lastRelayDate.getTime() - point.date.getTime();
      if (ageSeconds > bufferConfig.interval_seconds) {
        this.points.shift(); //point is expired
      }
      else {
        break;
      }
    }
  }
  _createAggregatePoint() {
    var bufferConfig = this._getBufferConfig();
    var aggPoint = Object.assign({}, this.points[this.points.length-1]);

    for (var i = 0; i < bufferConfig.attributes.length; i++) {
      var attr = bufferConfig.attributes[i];
      var aggVal = null;
      if (attr.function == "average") {
        aggVal = this._attrAverage(attr.jsonpath);
      }
      else {
        throw `Unsupported buffering function: '${attr.function}'`;
      }
      //set value 
      jp.value(aggPoint.data, attr.jsonpath, aggVal);
      return aggPoint;
    }
  }
  _attrAverage(jsonpath) {
    var sum = 0.0;
    for (var i = 0; i < this.points.length; i++) {
      var point = this.points[i];
      sum += jp.value(point.data, jsonpath)
    };
    var average = sum / this.points.length;
    return average;
  }
  _relay(point) {
    postToBitripl(this.channelInfo, point.data);
    this.lastRelayDate = new Date();
  }
}

//Init
//-----------------------------------------------------------------------------

const app = express()
var deviceToChannelMapping = JSON.parse(fs.readFileSync(mappingFilename, 'utf8'));
var allStreams = createStreams();

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
        var dataAsObj = null;
        try {
            dataAsObj = JSON.parse(body)
        }
        catch (e) {
            console.warn(" Invalid request body")
            res.status(400).send({"msg": "Invalid request body"});
            return;
        }
        
        var point = new Point(dataAsObj);
        console.log(` Received data: ${body}`)
        try {
            streams = getStreamsFromDevice(deviceId);
        }
        catch (e) {
          console.warn(` ${e}`)
          res.status(400).send({"msg": `${e}`});  
          return;
        }
        console.log(" Streaming to channels:");
        for (var i = 0; i < streams.length; i++) {
          streams[i].addPoint(point)
        }
        res.sendStatus(200);
    });

  });


//Helper functions
//-----------------------------------------------------------------------------

function createStreams() {
  var streams = [];
  for (var i = 0; i < deviceToChannelMapping.length; i++) {
    var channelInfo = deviceToChannelMapping[i];
    var stream = new Stream(channelInfo);
    streams.push(stream);
  }
  return streams;
}

function getStreamsFromDevice(deviceId) {
    allStreams.map(stream => {
      return stream.channelInfo.device_id
      }
    )
    var matchedStreams = allStreams.filter(stream => stream.channelInfo.device_id == deviceId)
    if (!matchedStreams.length) {
      throw `Unknown Device ID: ${deviceId}`
    }
    return matchedStreams
}

function postToBitripl(channelInfo, data) {
    
    var dataAsJson = JSON.stringify(data);

    // An object of options to indicate where to post to
    var options = {
        host: 'www.bitripl.com',
        port: '443',
        path: `/api/accounts/${channelInfo.bitripl_account}/channels/${channelInfo.bitripl_channel}/data`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(dataAsJson),
            'bitripl-access-code': channelInfo.bitripl_access_code
        }
    };
    
    var post_req = https.request(options, function(res) {
          console.log(` Posting to ${channelInfo.bitripl_account}/${channelInfo.bitripl_channel}`)
          console.log(`  Relayed data: ${dataAsJson}`)
          console.log(`  Response status code: ${res.statusCode}`)
          var resp_data = [];
          res.on('data', (chunk) => {
              resp_data.push(chunk);
          }).on('end', () => {
              resp_data = Buffer.concat(resp_data).toString();
              if (res.statusCode != 200){
                console.log(`   ${resp_data}`)
              }
          })
      });

    // post the data
    post_req.write(dataAsJson);
    post_req.end();
}


//Main
//-----------------------------------------------------------------------------

app.listen(port, () => console.log(`${name} listening on port ${port}!`))