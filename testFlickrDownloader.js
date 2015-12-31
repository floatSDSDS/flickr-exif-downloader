/**
 * Created by harkous on 30/12/15.
 */

var Flickr = require('flickrapi');
var async = require('async');
var exifDown = require('./flickr-exif-downloader');

/**
 * allows testing the flickr downloader. make sure you use your own information below
 * @param api_key
 * @param secret
 * @param user_id
 * @param access_token
 * @param access_token_secret
 * @param numPhotos
 * @param searchUserId
 */
function testDownloader(api_key, secret, user_id, access_token, access_token_secret, numPhotos, searchUserId) {
    var flickrOptions = {
        api_key: api_key,
        secret: secret,
        user_id: user_id,
        access_token: access_token,
        access_token_secret: access_token_secret
    };
    Flickr.authenticate(flickrOptions, function (err, flickr) {
        flickr.photos.search({user_id: searchUserId}, function (error, results) {
            console.log('results: ' + JSON.stringify(results));

            async.each(results.photos.photo.slice(0, numPhotos), function (photo, callback) {

                flickr.photos.getInfo({photo_id: photo.id}, function (e, r) {
                    var flickrLocation = r.photo.location;
                    //console.log('r: ' + JSON.stringify(flickrLocation));
                    exifDown.downloadWithExif(flickr, photo, flickrLocation, './images', function (err) {
                        if (err) {
                            console.log('err: ' + err);
                        }
                        return callback();
                    });
                });
            });
        });
    });
}

// use your own information here
testDownloader('',
    '',
    "",
    "",
    "",
    5,
    ''
);
