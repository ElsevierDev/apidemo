'use strict'

const hapi = require('hapi');
const get = require('request-promise');
const promiseAll = require('promises-all');
const vision = require('vision');
const handlebars = require('handlebars');
const numeralHelper = require("handlebars.numeral");
const config = require('./config');

const server = new hapi.Server();

server.connection({
	host: '127.0.0.1',
	port: 3000
});

// Register vision for our views
server.register(vision, (err) => {
	server.views({
		engines: {
			html: handlebars
		},
		relativeTo: __dirname,
		path: './views',
	});
});

// Show search form
server.route({
	method: 'GET',
	path: '/',
	handler: function(request, reply) {
		reply.view('index');
	}
});

// Find authors
server.route({
	method: 'GET',
	path: '/search',
	handler: function(request, reply) {
		var options = getBasicOptions('https://api.elsevier.com/content/search/author');
		options.qs = {
			query: getAuthorQuery(request.query.name),
			count: 20
		}
		get(options)
			.then(function(body) {
				const data = JSON.parse(body);
				reply.view('results', {result: data['search-results']});
			}).catch(function(error) {
				throw error;
			});
	}
});

// Show a particular author
server.route({
	method: 'GET',
	path: '/author/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the authors metrics from SciVal
		const authorId = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/metrics');
		options.qs = {
			metrics: 'ScholarlyOutput,CitationCount,hIndices,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			authors: authorId
		}
		promises.push(
			get(options)
				.then(function(body) {
					context.metrics = JSON.parse(body).results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the authors most recent pubs from Scopus
		options.url = 'https://api.elsevier.com/content/search/scopus';
		options.qs = {
			query: 'au-id(' + authorId + ')',
			field: 'eid,title,citedby-count,coverDate',
			sort: 'coverDate',
			count: 5
		}
		promises.push(
			get(options)
				.then(function(body) {
					context.docs = JSON.parse(body)['search-results'].entry;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the author profile
		options.url = 'https://api.elsevier.com/content/author/author_id/' + authorId;
		options.qs = {
			field: 'surname,given-name',
			httpAccept: 'application/json'
		}
		promises.push(
			get(options)
				.then(function(body) {
					context.author = JSON.parse(body)['author-retrieval-response'][0];
				}).catch(function(error) {
					throw error;
				})
		);

		promiseAll.all(promises)
			.then(function() {
				reply.view('author', context);
			}).catch(function(error) {
				throw error;
			})
	}
});

// Show a particular abstact
server.route({
	method: 'GET',
	path: '/abstract/{id}',
	handler: function(request, reply) {
		const eid = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/content/abstract/eid/' + eid);
		options.qs = {
			httpAccept: 'application/json'
		}
		get(options)
			.then(function(body) {
				const data = JSON.parse(body);
				reply.view('abstract', {result: data['abstracts-retrieval-response']});
			}).catch(function(error) {
				throw error;
			})
	}
});

// Helper function that extracts the numeric portion of a Scopus EID.
handlebars.registerHelper('removeEIDPrefix', function(str) {
	var pos = str.lastIndexOf('-');
	return str.substring(pos+1);
});
// Helper function that adds spaces to camelcase strings
handlebars.registerHelper('camelCaseToString', function(str) {
	return str.split(/(?=[A-Z])/).join(' ');
});
// Helper function that does a logical if comparison
handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});
numeralHelper.registerHelpers(handlebars);

// Get basic REST API options
function getBasicOptions(url) {
	return {
		url: url,
		headers: {
			'Content-Type' : 'application/json',
			'X-ELS-APIKey' : config.api_key,
			'X-ELS-Insttoken' : config.inst_token
		}
	};
};

// Get Scopus author query string
function getAuthorQuery(fullName) {
	var firstName = fullName.split(' ').slice(0, -1).join(' ');
	var lastName = fullName.split(' ').slice(-1).join(' ');
	var query = 'authlast(' + lastName + ')';
	if (firstName) {
		query += ' and authfirst(' + firstName + ')';
	}
	return query;
}

server.start((err) => {
	if (err) {
		throw err;
	}
	console.log(`Server running at: ${server.info.uri}`);
});