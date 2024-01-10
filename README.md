# RT Data Parser

Fetch data from [RT](https://github.com/bestpractical/rt) using [REST 2](https://docs.bestpractical.com/rt/5.0.5/RT/REST2.html) and parse it into a .csv file

![demo](https://github.com/PTFS-Europe/rt-data-parser/blob/master/image.jpg?raw=true)

# CLI Usage
```
node rt_data_parser.js ${RT_HOST} ${RT_USER} ${RT_PASS} > rt_data.csv
```

## Example
```
node rt_data_parser.js https://helpdesk.yoursite.com username pass > rt_data.csv
```