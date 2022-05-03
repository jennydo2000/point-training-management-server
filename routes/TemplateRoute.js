const express = require("express");
const {asyncRoute} = require("../utils/route");
const {validationResult} = require("express-validator");
const {bookshelf} = require("../utils/db");
const Promise = require('bluebird');

module.exports = (
    model,
    options,
) => {
    const route = express.Router({mergeParams: true});

    route.get("/", asyncRoute(async (req, res) => {
        let data = null;
        if (options?.list?.fetch)
            data = (await options.list.fetch(req, res));
        else {
            data = new model();
            if (options.list?.query) data = options.list.query(data);
            data = data.where(qb => {
                if (options.list?.search && req.query.search)
                    options.list?.search.forEach(column => qb.orWhere(column, "ilike", `%${req.query.search}%`));
                return qb;
            })
            .orderBy("created_at", "DESC")
            .fetchAll(options?.fetchOptions || {});
            data = await data;
        }
        return res.json({data: data});
    }));

    route.get("/create", asyncRoute(async (req, res) => {
        const results = {};
        if (!options?.create?.options) return results;
        for (const option of Object.keys(options.create.options)) {
            let data = null;
            if (typeof options.create.options[option] === "function")
               data =  await options.create.options[option](req,res);
            else data = options.create.options[option];
            results[option] = data;
        }
        return res.json(results);
    }));

    route.get("/:id", asyncRoute(async (req, res) => {
        const data = await new model({id: req.params.id}).fetch(options?.fetchOptions || {});
        return res.json(data);
    }));

    route.post("/import", options.import?.rules || [], asyncRoute(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json(errors);

        if (options.import?.custom)
            return await options.import.custom(req, res);
        else {
            const rows = req.body.map(row => {
                const fields = {};
                options.import.fields.map(field => fields[field] = row[field]);
                return fields;
            });
            const Collection = bookshelf.Collection.extend({model: model});
            const collection = Collection.forge(rows);
            const data = await Promise.all(collection.invokeMap('save'));
            return res.json(data);
        }
    }));

    route.post("/", options.insert?.rules || [], asyncRoute(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json(errors);

        if (options.insert?.custom)
            return await options.insert.custom(req, res);
        else {
            const fields = {};
            options.insert.fields.map(field => fields[field] = req.body[field]);
            const result = await new model(fields).save();
            const data = await new model({id: result.id}).fetch(options?.fetchOptions || {});
            return res.json(data);
        }
    }));

    route.put("/:id", options.update?.rules || [], asyncRoute(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json(errors);

        if (options.update?.custom)
            return await options.update.custom(req, res);
        else {
            const fields = {};
            options.update.fields.map(field => fields[field] = req.body[field]);
            const result = await new model({id: req.params.id}).save(fields);
            const data = await new model({id: result.id}).fetch(options?.fetchOptions || {});
            return res.json(data);
        }
    }));

    route.delete("/:id", asyncRoute(async (req, res) => {
        if (options.delete?.custom)
            return await options.delete.custom(req, res);
        else {
            const result = await new model({id: req.params.id}).fetch();
            await new model({id: req.params.id}).destroy();
            return res.json(result);
        }
    }));

    return route;
}