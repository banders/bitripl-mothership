# bitripl-mothership

Relays data from sensor devices on a local network to time-series data platform [bitripl.com](https://www.bitripl.com).

Q: Why can't sensor devices upload directly to bitripl without an intermediary relay service?  A: All communication with bitripl must be encrypted to protect data (i.e. bitripl uses HTTPS).  Some sensor devices do not have sufficient CPU and memory resources to encrypt and decrypt communication.  Such devices cannot communicate directly with bitripl.  Instead, they must upload to a relay service which doesn't require HTTPS.  The relay service will then forward the data to bitripl via HTTPS on behalf of the sensor device.


## Setup

Create a mappings.json file to define which sensor device whill be mapped to which bitripl channel.

```
[
  {
    "device_id": "my-sensor-id",
    "bitripl_account": "my_account",
    "bitripl_channel": "my_channel",
    "bitripl_access_code": "my_channel_access_code"
  }
]
```

... or to downscale the time resolution of the data, you can configure a buffer over a time interval:

```
[
  {
    "device_id": "sensor-test1",
    "bitripl_account": "my_account",
    "bitripl_channel": "my_channel",
    "bitripl_access_code": "my_channel_access_code",
    "buffer": {
      "interval_seconds": 1800,
      "attributes": [
        {
          "function": "average",
          "jsonpath": "$.sensor_property_name"
        }
      ]
    }
  }
]
```

This will collect all the data points over a half-hour (1800 second) interval, and will then merge them into a new aggregated data point with an average value of the data property called `sensor_property_name`.  Values for any other properties in the aggregated data point will be copied from the last data point in the interval.  The aggregate data point will be relayed to a bitripl.com channel when the interval ends.


## Run

node bitripl-mothership.js

## Interface between a sensor device and bitripl-mothership

Sensors can upload to bitripl-mothership via its built-in REST API:

```
POST [IP_ADDRESS_OF_BITRIPL_MOTHERSHIP]:9505/
  headers: 
    Content-Type: application/json
    bitripl-device-id: YOUR DEVICE ID
  body:
    any JSON content that you want to relay to bitripl
```

When bitripl-mothership receives a POST request, it will forward the request to bitripl.com according to the instructions in the mappings.json file.

## Example

[Build a wifi-connected temperature sensor](https://www.bitripl.com/docs/tutorials/build-temperature-sensor/build-temperature-sensor/) which uses `bitripl-mothership` to upload data to a bitripl channel.