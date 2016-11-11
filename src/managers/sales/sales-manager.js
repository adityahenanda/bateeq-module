'use strict';

// external deps 
var ObjectId = require('mongodb').ObjectId;

// internal deps
require('mongodb-toolkit');
var BaseManager = require('../base-manager');
var BateeqModels = require('bateeq-models');
var Sales = BateeqModels.sales.Sales; 
var TransferOutDoc = BateeqModels.inventory.TransferOutDoc;
var map = BateeqModels.map;
var generateCode = require('../../utils/code-generator');

module.exports = class SalesManager extends BaseManager {
    constructor(db, user) {
        super(db, user);
        this.collection = this.db.use(map.sales.SalesDoc);
        
        var ItemManager = require('../master/finished-goods-manager');
        this.itemManager = new ItemManager(db, user);
        
        var StoreManager = require('../master/store-manager');
        this.storeManager = new StoreManager(db, user); 
        
        var BankManager = require('../master/bank-manager');
        this.bankManager = new BankManager(db, user);  
        
        var CardTypeManager = require('../master/card-type-manager');
        this.cardTypeManager = new CardTypeManager(db, user);  
                
        var TransferOutDocManager = require('../inventory/transfer-out-doc-manager');
        this.transferOutDocManager = new TransferOutDocManager(db, user);
        
        var InventoryManager = require('../inventory/inventory-manager');
        this.inventoryManager = new InventoryManager(db, user);
        
        var PromoManager = require('./promo-manager');
        this.promoManager = new PromoManager(db, user);
        
    }
    
    _createIndexes() {
        var dateIndex = {
            name: `ix_${map.sales.SalesDoc}__updatedDate`,
            key: {
                _updatedDate: -1
            }
        }

        var codeIndex = {
            name: `ix_${map.sales.SalesDoc}_code`,
            key: {
                code: 1
            },
            unique: true
        }

        return this.collection.createIndexes([dateIndex, codeIndex]);
    }
    
    _getQuery(paging) { 
        var deleted = {
            _deleted: false
        };
        
        var query = paging.filter ? {
            '$and': [paging.filter, deleted]
        } : deleted; 

        if (paging.keyword) {
            var regex = new RegExp(paging.keyword, "i");
            var filterCode = {
                'code': {
                    '$regex': regex
                }
            }; 
            var $or = {
                '$or': [filterCode]
            };

            query['$and'].push($or);
        }
        return query; 
    }

    create(sales) {
        return new Promise((resolve, reject) => {
            sales.code = generateCode("sales");
            this._validate(sales)
                .then(validSales => {   
                    var validTransferOutDoc = {};
                    validTransferOutDoc.code = generateCode("sales");
                    validTransferOutDoc.reference = validSales.code;
                    validTransferOutDoc.sourceId = validSales.store.storageId;
                    validTransferOutDoc.destinationId = validSales.store.storageId;
                    validTransferOutDoc.items = [];
                    for (var item of validSales.items) {
                        var newitem = {};
                        newitem.itemId = item.itemId;
                        newitem.quantity = item.quantity;
                        validTransferOutDoc.items.push(newitem);
                    } 
                    validTransferOutDoc = new TransferOutDoc(validTransferOutDoc);
                    
                    var createData = [];
                    createData.push(this.transferOutDocManager.create(validTransferOutDoc));
                    createData.push(this.collection.insert(validSales));
                    
                    Promise.all(createData)
                        .then(results => {
                            resolve(results[1]);
                        })
                        .catch(e => {
                            reject(e);
                        })
                })
                .catch(e => {
                    reject(e);
                })
        });
    }
 
    _validate(sales) {
        var errors = {};
        return new Promise((resolve, reject) => {
            var valid = new Sales(sales); 
            
            var salesDetailError = {};
            if (!valid.code || valid.code == '')
                errors["code"] = "code is required";
            if (!sales.storeId || sales.storeId == '')
                errors["storeId"] = "storeId is required"; 
            if(!sales.salesDetail)
            {
                errors["salesDetail"] = "salesDetail is required";
                sales.salesDetail = {};
            }
            if (!sales.salesDetail.paymentType || sales.salesDetail.paymentType == '')
                salesDetailError["paymentType"] = "paymentType is required";
            valid.date = new Date(valid.date);
            if (Object.prototype.toString.call(valid.date) === "[object Date]") {
                if (isNaN(valid.date.getTime())) {
                    errors["date"] = "date is not valid";
                }
            }
            else {
                errors["date"] = "date is not valid";
            }
            
            
            
            for (var prop in salesDetailError) {
                errors["salesDetail"] = salesDetailError;
                break;
            }
                  
            //Get sales data
            var getSales = this.collection.singleOrDefault({
                "$and": [{
                    _id: {
                        '$ne': new ObjectId(valid._id)
                    }
                }, {
                        code: valid.code
                    }]
            });  
            var getStore;// = this.storeManager.getSingleByIdOrDefault(sales.storeId);
            var getBank;// = this.bankManager.getSingleByIdOrDefault(sales.salesDetail.bankId);
            var getCardType;// = this.cardTypeManager.getSingleByIdOrDefault(sales.salesDetail.cardTypeId);
            var getVoucher = Promise.resolve(null);
            var getItems = [];
            var getPromos = [];
            
            if (!sales.storeId || sales.storeId == '' || this.isEmpty(sales.storeId)) {
                getStore = Promise.resolve(null);
                sales.storeId = {};
            }
            else {
                getStore = this.storeManager.getSingleByIdOrDefault(sales.storeId);
            }  
            
            if (!sales.salesDetail.bankId || sales.salesDetail.bankId == '' || this.isEmpty(sales.salesDetail.bankId)) {
                getBank = Promise.resolve(null);
                sales.salesDetail.bankId = {};
            }
            else {
                getBank = this.bankManager.getSingleByIdOrDefault(sales.salesDetail.bankId);
            }  
            
            if (!sales.salesDetail.cardTypeId || sales.salesDetail.cardTypeId == '' || this.isEmpty(sales.salesDetail.cardTypeId)) {
                getCardType = Promise.resolve(null);
                sales.salesDetail.cardTypeId = {};
            }
            else {
                getCardType = this.cardTypeManager.getSingleByIdOrDefault(sales.salesDetail.cardTypeId);
            }  
                        
            if (valid.items && valid.items.length > 0) {
                for (var item of valid.items) {  
                    if (!item.itemId || item.itemId == '' || this.isEmpty(item.itemId)) {
                        getItems.push(Promise.resolve(null));
                        item.itemId = {};
                    }
                    else {
                        getItems.push(this.itemManager.getSingleByIdOrDefault(item.itemId));
                    }  
                    if (!item.promoId || item.promoId == '' || this.isEmpty(item.promoId)) {
                        getPromos.push(Promise.resolve(null));
                        item.promoId = {};
                    }
                    else {
                        getPromos.push(this.promoManager.getSingleByIdOrDefault(item.promoId));
                    } 
                }
            }
            else {
                errors["items"] = "items is required";
            }
            
            var countGetItems = getItems.length;
            var countGetPromos = getPromos.length;
            Promise.all([getSales, getStore, getBank, getCardType, getVoucher].concat(getItems).concat(getPromos))
               .then(results => {
                    var _sales = results[0];
                    var _store = results[1];
                    var _bank = results[2];
                    var _cardType = results[3];
                    var _voucherType = results[4];
                    var _items = results.slice(5, results.length - countGetPromos) 
                    var _promos = results.slice(results.length - countGetPromos, results.length) 
                     
                    if (_sales) {
                        errors["code"] = "code already exists";
                    }  
                    
                    if (!_store) {
                        errors["storeId"] = "storeId not found";
                    }
                    else {
                        valid.storeId = _store._id;
                        valid.store = _store;
                    }  
                    
                    if (valid.discount == undefined || (valid.discount && valid.discount == '')) {
                        errors["discount"] = "discount is required";
                        valid.discount = 0;
                    }
                    else if (parseInt(valid.discount) < 0 || parseInt(valid.discount) > 100) {
                        errors["discount"] = "discount must be greater than 0 or less than 100";
                    }  
                      
                    valid.totalProduct = 0;
                    valid.subTotal = 0;
                    valid.grandTotal = 0;
                    if (_items.length > 0) {
                        var itemErrors = [];
                        for (var _item of _items) {
                            var index = _items.indexOf(_item);
                            var item = valid.items[index];
                            var itemError = {};

                            if (!item.itemId || item.itemId == '' || this.isEmpty(item.itemId)) {
                                itemError["itemId"] = "itemId is required";
                            }
                            else {
                                for (var i = valid.items.indexOf(item) + 1; i < valid.items.length; i++) {
                                    var otherItem = valid.items[i];
                                    if (item.itemId == otherItem.itemId) {
                                        itemError["itemId"] = "itemId already exists on another detail";
                                    }
                                }
                            }
                            
                            if (!_item) {
                                itemError["itemId"] = "itemId not found";
                            }
                            else {
                                item.itemId = _item._id;
                                item.item = _item;
                                if(_item.size)
                                    if(_item.size.name)
                                        item.size = _item.size.name;
                                item.price = parseInt(_item.domesticSale);
                            }
                            
                            if (!item.promoId || item.promoId == ''|| this.isEmpty(item.promoId)) { }
                            else {
                                var _promo = _promos[index];
                                if (!_promo) {
                                    itemError["promoId"] = "promoId not found";
                                }
                                else {
                                    item.promoId = _promo._id;
                                    item.promo = _promo;
                                    
                                    if(_promo.reward.type == "discount-product")
                                    {
                                        // for(var reward of _promo.reward.rewards) {
                                        //     if(reward.unit == "percentage") {
                                        //         item.discount1 = reward.discount1;
                                        //         item.discount2 = reward.discount2;
                                        //     }
                                        //     else if(reward.unit == "nominal") {
                                        //         item.discountNominal = reward.nominal;
                                        //     }
                                        // }
                                    }
                                    if(_promo.reward.type == "special-price") 
                                    {
                                        //cek quantity
                                        var quantityPaket = 0;
                                        for(var item2 of valid.items) {
                                            if(item.promoId.toString() == item2.promoId.toString()) {
                                                quantityPaket = parseInt(quantityPaket) + parseInt(item2.quantity)
                                            }
                                        }
                                        
                                        //change price
                                        for(var item2 of valid.items) {
                                            if(item.promoId == item2.promoId) {
                                                for(var reward of _promo.reward.rewards) {
                                                    if(parseInt(quantityPaket) == 1)
                                                        item2.price = parseInt(reward.quantity1);
                                                    else if(parseInt(quantityPaket) == 2)
                                                        item2.price = parseInt(reward.quantity2);
                                                    else if(parseInt(quantityPaket) == 3)
                                                        item2.price = parseInt(reward.quantity3);
                                                    else if(parseInt(quantityPaket) == 4)
                                                        item2.price = parseInt(reward.quantity4);
                                                    else if(parseInt(quantityPaket) >= 5)
                                                        item2.price = parseInt(reward.quantity5);
                                                }  
                                            }
                                        } 
                                    } 
                                } 
                            } 

                            if (item.quantity == undefined || (item.quantity && item.quantity == '')) {
                                itemError["quantity"] = "quantity is required";
                                item.quantity = 0;
                            }
                            else if (parseInt(item.quantity) <= 0) {
                                itemError["quantity"] = "quantity must be greater than 0";
                            } 
                            
                            if (item.price == undefined || (item.price && item.price == '')) {
                                itemError["price"] = "price is required";
                                item.price = 0;
                            }
                            else if (parseInt(item.price) < 0) {
                                itemError["price"] = "price must be greater than 0";
                            } 
                            
                            if (item.discount1 == undefined || (item.discount1 && item.discount1 == '')) {
                                itemError["discount1"] = "discount1 is required";
                                item.discount1 = 0;
                            }
                            else if (parseInt(item.discount1) < 0 || parseInt(item.discount1) > 100) {
                                itemError["discount1"] = "discount1 must be greater than 0 or less than 100";
                            } 
                            
                            if (item.discount2 == undefined || (item.discount2 && item.discount2 == '')) {
                                itemError["discount2"] = "discount2 is required";
                                item.discount2 = 0;
                            }
                            else if (parseInt(item.discount2) < 0 || parseInt(item.discount2) > 100) {
                                itemError["discount2"] = "discount2 must be greater than 0 or less than 100";
                            } 
                            
                            if (item.discountNominal == undefined || (item.discountNominal && item.discountNominal == '')) {
                                itemError["discountNominal"] = "discountNominal is required";
                                item.discountNominal = 0;
                            }
                            else if (parseInt(item.discountNominal) < 0) {
                                itemError["discountNominal"] = "discountNominal must be greater than 0";
                            } 
                            
                            if (item.margin == undefined || (item.margin && item.margin == '')) {
                                itemError["margin"] = "margin is required";
                                item.margin = 0;
                            }
                            else if (parseInt(item.margin) < 0 || parseInt(item.margin) > 100) {
                                itemError["margin"] = "margin must be greater than 0 or less than 100";
                            } 
                            
                            if (item.specialDiscount == undefined || (item.specialDiscount && item.specialDiscount == '')) {
                                itemError["specialDiscount"] = "specialDiscount is required";
                                item.margin = 0;
                            }
                            else if (parseInt(item.specialDiscount) < 0 || parseInt(item.specialDiscount) > 100) {
                                itemError["specialDiscount"] = "specialDiscount must be greater than 0 or less than 100";
                            } 
                            
                            var total = 0;
                            if(parseInt(item.quantity) > 0) {
                                //Price
                                total = parseInt(item.quantity) * parseInt(item.price);
                                //Diskon
                                total = (total * (1 - (parseInt(item.discount1) / 100)) * (1 - (parseInt(item.discount2) / 100))) - parseInt(item.discountNominal);
                                //Spesial Diskon 
                                total = total * (1 - (parseInt(item.specialDiscount) / 100))
                                //Margin
                                total = total * (1 - (parseInt(item.margin) / 100))
                            }  
                            valid.subTotal = parseInt(valid.subTotal) + parseInt(total);
                            valid.totalProduct = parseInt(valid.totalProduct) + parseInt(item.quantity);
                            itemErrors.push(itemError);
                        }
                        var totalDiscount = parseInt(valid.subTotal) * parseInt(valid.discount) / 100; 
                        valid.grandTotal = parseInt(valid.subTotal) - parseInt(totalDiscount);
                        
                        for (var itemError of itemErrors) {
                            for (var prop in itemError) {
                                errors.items = itemErrors;
                                break;
                            }
                            if (errors.items)
                                break;
                        }
                    } 
                    
                    if (valid.salesDetail.paymentType.toLowerCase() != "card" && valid.salesDetail.paymentType.toLowerCase() != "cash" && valid.salesDetail.paymentType.toLowerCase() != "partial") {
                        salesDetailError["paymentType"] = "paymentType not valid";
                    }
                    else {                        
                        if(valid.salesDetail.paymentType.toLowerCase() == "card" || valid.salesDetail.paymentType.toLowerCase() == "partial"){
                            if (!sales.salesDetail.bankId || sales.salesDetail.bankId == '')
                                salesDetailError["bankId"] = "bankId is required";
                            if (!_bank) {
                                salesDetailError["bankId"] = "bankId not found";
                            }
                            else {
                                valid.salesDetail.bankId = _bank._id;
                                valid.salesDetail.bank = _bank;
                            } 
                            
                            if (!valid.salesDetail.card || valid.salesDetail.card == '')
                                salesDetailError["card"] = "card is required";
                            else {
                                if(valid.salesDetail.card.toLowerCase() != 'debit' && valid.salesDetail.card.toLowerCase() != 'credit')
                                    salesDetailError["card"] = "card must be debit or credit"; 
                                else { 
                                    if(valid.salesDetail.card.toLowerCase() != 'debit')
                                    {
                                        if (!sales.salesDetail.cardTypeId || sales.salesDetail.cardTypeId == '')
                                            salesDetailError["cardTypeId"] = "cardTypeId is required"; 
                                        if (!_cardType) {
                                            salesDetailError["cardTypeId"] = "cardTypeId not found";
                                        }
                                        else {
                                            valid.salesDetail.cardTypeId = _cardType._id;
                                            valid.salesDetail.cardType = _cardType;
                                        }   
                                    }
                                }
                            }
                                
                            if (!valid.salesDetail.cardNumber || valid.salesDetail.cardNumber == '')
                                salesDetailError["cardNumber"] = "cardNumber is required";
                                
                            // if (!valid.salesDetail.cardName || valid.salesDetail.cardName == '')
                            //     salesDetailError["cardName"] = "cardName is required"; 
                                
                            if (valid.salesDetail.cardAmount == undefined || (valid.salesDetail.cardAmount && valid.salesDetail.cardAmount == '')) {
                                salesDetailError["cardAmount"] = "cardAmount is required";
                                valid.salesDetail.cardAmount = 0;
                            } 
                            else if(parseInt(valid.salesDetail.cardAmount) < 0) {
                                salesDetailError["cardAmount"] = "cardAmount must be greater than 0";
                            }  
                        }  
                        
                        if(valid.salesDetail.paymentType.toLowerCase() == "cash" || valid.salesDetail.paymentType.toLowerCase() == "partial"){ 
                            if (valid.salesDetail.cashAmount == undefined || (valid.salesDetail.cashAmount && valid.salesDetail.cashAmount == '')) {
                                salesDetailError["cashAmount"] = "cashAmount is required";
                                valid.salesDetail.cashAmount = 0;
                            } 
                            else if(parseInt(valid.salesDetail.cashAmount) < 0) {
                                salesDetailError["cashAmount"] = "cashAmount must be greater than 0";
                            } 
                        } 
                         
                        if(valid.salesDetail.voucher) {
                            var voucherError = {};
                            if (valid.salesDetail.voucher.value == undefined || (valid.salesDetail.voucher.value && valid.salesDetail.voucher.value == '')) {
                                valid.salesDetail.voucher.value = 0;
                            } 
                            if(parseInt(valid.salesDetail.voucher.value) > parseInt(valid.grandTotal)) {
                                voucherError["value"] = "voucher must be less than grandTotal";
                            }
                             
                            for (var prop in voucherError) {
                                salesDetailError["voucher"] = voucherError;
                                break;
                            } 
                        }
                         
                        var totalPayment = 0;
                        if(valid.salesDetail.paymentType.toLowerCase() == "partial")
                            totalPayment = parseInt(valid.salesDetail.cashAmount) + parseInt(valid.salesDetail.cardAmount) + parseInt(valid.salesDetail.voucher.value);
                                
                        if(valid.salesDetail.paymentType.toLowerCase() == "card")
                            totalPayment = parseInt(valid.salesDetail.cardAmount) + parseInt(valid.salesDetail.voucher.value);
                                
                        if(valid.salesDetail.paymentType.toLowerCase() == "cash")
                            totalPayment = parseInt(valid.salesDetail.cashAmount) + parseInt(valid.salesDetail.voucher.value);
                                
                        if(parseInt(totalPayment) < parseInt(valid.grandTotal))
                            errors["grandTotal"] = "grandTotal is bigger than payment";  
                    } 
                    
                    for (var prop in salesDetailError) {
                        errors["salesDetail"] = salesDetailError;
                        break;
                    }
            
                    for (var prop in errors) {
                        var ValidationError = require('../../validation-error');
                        reject(new ValidationError('data does not pass validation', errors));
                    }

                    // valid = new Sales(valid);
                    // valid.stamp(this.user.username, 'manager');
                    // resolve(valid);

                    var getStocks = [];
                    for (var _item of _items) {
                        getStocks.push(this.inventoryManager.getByStorageIdAndItemIdOrDefault(_store.storageId, _item._id));
                    } 
                    Promise.all(getStocks) 
                        .then(resultStocks => { 
                            var itemErrors = [];
                            for(var stock of resultStocks) { 
                                var index = resultStocks.indexOf(stock);
                                var item = valid.items[index];
                                var itemError = {};
                                if(stock) {
                                    if (item.quantity > stock.quantity) {
                                        itemError["quantity"] = "Quantity is bigger than Stock";
                                    } 
                                }
                                else {
                                    itemError["quantity"] = "Quantity is bigger than Stock";
                                }
                                itemErrors.push(itemError);
                            }
                            for (var itemError of itemErrors) {
                                for (var prop in itemError) {
                                    errors.items = itemErrors;
                                    break;
                                }
                                if (errors.items)
                                    break;
                            }
                            for (var prop in errors) {
                                var ValidationError = require('../../validation-error');
                                reject(new ValidationError('data does not pass validation', errors));
                            }
                    
                            valid = new Sales(valid);
                            valid.stamp(this.user.username, 'manager');
                            resolve(valid);
                        })
                        .catch(e => { 
                            reject(e);
                        })
                })
                .catch(e => { 
                    for (var prop in errors) {
                        var ValidationError = require('../../validation-error');
                        reject(new ValidationError('data does not pass validation', errors));
                    } 
                    reject(e);
                })
        });
    }
    
    isEmpty(obj) {
        for(var prop in obj) {
            if(obj.hasOwnProperty(prop))
                return false;
        } 
        return JSON.stringify(obj) === JSON.stringify({});
    }

};