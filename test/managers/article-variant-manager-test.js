var should = require('should');
var helper = require('../helper');
var validate = require('bateeq-models').validator.core.article;
var manager;

function getData() {
    var ArticleVariant = require('bateeq-models').core.article.ArticleVariant;
    var articleVariant = new ArticleVariant();

    var now = new Date();
    var stamp = now / 1000 | 0;
    var code = stamp.toString(36);

    articleVariant.code = code;
    articleVariant.name = `name[${code}]`;
    articleVariant.description = `description for ${code}`;
    articleVariant.size = `size[${code}]`;
    articleVariant.domesticCOGS = 1;
    articleVariant.domesticWholesale = 1;
    articleVariant.domesticRetail = 1;
    articleVariant.domesticSale = 1;
    articleVariant.internationalCOGS = 1;
    articleVariant.internationalWholesale = 1;
    articleVariant.internationalRetail = 1;
    articleVariant.internationalSale = 1;

    return articleVariant;
}

before('#00. connect db', function(done) {
    helper.getDb()
        .then(db => {
            var ArticleVariantManager = require('../../src/managers/core/article/article-variant-manager');
            manager = new ArticleVariantManager(db, {
                username: 'unit-test'
            });
            done();
        })
        .catch(e => {
            done(e);
        })
});

var createdId;
it('#01. should success when create new data', function(done) {
    var data = getData();
    manager.create(data)
        .then(id => {
            id.should.be.Object();
            createdId = id;
            done();
        })
        .catch(e => {
            done(e);
        })
});

var createdData;
it(`#02. should success when get created data with id`, function(done) {
    manager.getSingleByQuery({
            _id: createdId
        })
        .then(data => {
            validate.articleVariant(data);
            createdData = data;
            done();
        })
        .catch(e => {
            done(e);
        })
});

it(`#03. should success when update created data`, function(done) {

    createdData.code += '[updated]';
    createdData.name += '[updated]';
    createdData.description += '[updated]';

    manager.update(createdData)
        .then(id => {
            createdId.toString().should.equal(id.toString());
            done();
        })
        .catch(e => {
            done(e);
        });
});

it(`#04. should success when get updated data with id`, function(done) {
    manager.getSingleByQuery({
            _id: createdId
        })
        .then(data => {
            validate.articleVariant(data);
            data.code.should.equal(createdData.code);
            data.name.should.equal(createdData.name);
            data.description.should.equal(createdData.description);
            done();
        })
        .catch(e => {
            done(e);
        })
});

it(`#05. should success when delete data`, function(done) {
    manager.delete(createdData)
        .then(id => {
            createdId.toString().should.equal(id.toString());
            done();
        })
        .catch(e => {
            done(e);
        });
});

it(`#06. should _deleted=true`, function(done) {
    manager.getSingleByQuery({
            _id: createdId
        })
        .then(data => {
            validate.articleVariant(data);
            data._deleted.should.be.Boolean();
            data._deleted.should.equal(true);
            done();
        })
        .catch(e => {
            done(e);
        })
});


it('#07. should error when create new data with same code', function(done) {
    var data = Object.assign({}, createdData);
    delete data._id;
    manager.create(data)
        .then(id => {
            id.should.be.Object();
            createdId = id;
            done("Should not be able to create data with same code");
        })
        .catch(e => {
            try {
                e.errors.should.have.property('code');
                done();
            }
            catch (e) {
                done(e);
            }
        })
});

it('#08. should error with property code name and size ', function(done) {
    manager.create({})
        .then(id => {
            done("Should not be error with property code and name");
        })
        .catch(e => {
            try {
                e.errors.should.have.property('code');
                e.errors.should.have.property('name');
                e.errors.should.have.property('size');
                done();
            }
            catch (ex) {
                done(ex);
            }
        })
});