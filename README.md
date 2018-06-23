Relays data from sensor devices on a local network to bitripl.com.



## setup

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

## Run

node bitripl-mothership.js

## Integration with bitripl-mothership from sensors on the local network

Sensors can upload to bitripl-mothership via its built-in REST API:

```
POST [IP_ADDRESS_OF_BITRIPL_MOTHERSHIP]:9505/
  headers: 
    Content-Type: application/json
    bitripl-device-id: YOUR DEVICE ID
  body:
    any JSON content that you want to relay to bitripl
```