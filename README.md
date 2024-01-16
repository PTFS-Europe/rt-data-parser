# RT Data Parser

Fetch data from [RT](https://github.com/bestpractical/rt) using [REST 2](https://docs.bestpractical.com/rt/5.0.5/RT/REST2.html) and parse it into a .csv file

![demo](https://github.com/PTFS-Europe/rt-data-parser/blob/master/tickets.jpg?raw=true)

## Installation
```
yarn install
```

## CLI Usage
```
node rt_data_parser.js -u ${RT_USER} -p ${RT_PASS} -h ${RT_HOST} -i ${TICKET_ID} -n ${NUMBER} > data.csv
```

### Example
Parse ticket #49504 and 20 tickets below that, down to ticket #49484
```
node rt_data_parser.js -u user -p pass -h https://helpdesk.yoursite.com -i 49504 -n 20 > data.csv
```

## Error logging
Errors with ticket/transaction information are logged to ./error.log

## Tests
```
npm test
```