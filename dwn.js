/* Library to bundle all calculations around blood glucose, insulin and meals for type 1 diabetes
* It provides means to get blood glucose data and manipulate it by adding insulin, meal and other events
*
* This code is designed to explain concepts not to make dosing decisions. We do our best to ensure that all 
* concepts are implemented as close to reality as possible but every body is different.
*
* Currently written in ECMA6 may have to transpile for older browsers
*/
"use strict";


/**
 * Glucose class. Represents the glucose data for a defined tiemspan
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Number} bolus_time   - The time of the bolus in minutes
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Glucose {
    constructor(from, to) {
        this.start
        this.factors = []
    }
    generateBase(from, to) {

    }
    loadJSON(json_object) {
        this.base = []
        let timeParse = d3.timeParse("%H:%M:%S")

        json_object.forEach(d => {
            this.base.push([timeParse(d[0]), d[1]]);
        })
    }
    addFactor(factor) {
        this.factors.push(factor)
    }
    /*
    * Returns the current bg curve
    */
    getShape() {
        let result = deep_copy(this.base)
        for (factor of this.factors) {
            result.forEach(d => {
                d[1] = d[1] - factor.apply(d[0])
            })
        }

        return this.base;
        // bg = deep_copy_array(base_bg)
        // fLen = factors.length;
        // for (i = 0; i < fLen; i++) {
        //     //apply factor to bg
        //     bg = apply_factor(factors[i], bg)
        // }
        // return bg
    }

    timeInRange() {
        let bg_data = this.getShape();
        var inrange = 0;
        for (i = 0; i < bg_data.length; i++) {
            if (bg_data[i][1] > 69 && bg_data[i][1] < 181) {
                inrange++;
            }
        }
        return Math.round(inrange / bg_data.length * 100);
    }

}


const FACTOR_TYPE = {
    "INSULIN": { APPLY: function (bg, insulin, isf) { return bg - insulin * isf }, PARAMETER: "BG" },
    "MEAL": { APPLY: function (bg, carbs, cr) { return bg + carbs * cr }, PARAMETER: "BG" },
}

const INSULIN_TYPE = {
    "RAPID": { PEAK: 80, DURATION: 300, ONSET: 10 },  // e.g. humalog
}



/**
 * Insulin class. Represents one bolus with:
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Number} bolus_time   - The time of the bolus in minutes
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Insulin {
    constructor(dose, bolus_time, type) {
        this.dose = dose;
        this.bolus_time = bolus_time;
        this.type = type;
    }



    /** 
    * Return active insulin at a point in time
    *
    * @param {Number} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    getActivity(time) {
        let end = this.type.DURATION - this.type.ONSET;
        let peak = this.type.PEAK - this.type.ONSET;

        if (time < this.type.ONSET) {
            return 0; //ugly can we find a function with a nice slow start?
        }
        let minsAgo = time - this.type.ONSET;
        let insulin = this.dose * 1000;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

        var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib
    }
    /**
    * returns insulin on board at a point in time
    * @param {Number} time - Minutes since bolus
    * @return {Number}
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    getIob(time) {
        let end = this.type.DURATION - this.type.ONSET;
        let peak = this.type.PEAK - this.type.ONSET;

        if (time < this.INSULIN_RAPID.ONSET) {
            return 0;
        }
        let minsAgo = time - this.INSULIN_RAPID.ONSET
        let insulin = dose * 1000;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor
        return insulin * (1 - S * (1 - a) * ((Math.pow(minsAgo, 2) / (tau * end * (1 - a)) - minsAgo / tau - 1) * Math.exp(-minsAgo / tau) + 1));
    }

    /**
    * returns insulin activity curve at a point in time
    * @param {Number} sampling - Sampling interval for the curve in minutes
    * @return {Array} - 2-dimensional array with timestamps and insulin values
    **/
    getShape(sampling = 5) {
        let curve = [];
        for (let min = 0; min < this.type.DURATION; min += sampling) {
            curve.push([d3.timeMinute.offset(this.bolus_time, min), this.getActivity(min)]);
        }
        return curve;
    }

    /**
    * set/change the time of the bolus
    * @param {Object} bolus_time - Time of the bolus d3 date object
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setTime(time) {
        this.bolus_time = time;
        return this;
    }

    /**
    * gete the time of the bolus
    * @return {Object} - Time of the bolus d3 date object
    **/
    getTime(time) {
        return bolus_time;
    }

    /**
    * set/change the amount of insulin
    * @param {Number} dose - The new dose of this insulin bolus
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setDose(dose) {
        this.dose = dose;
        return this;
    }

    /**
    * get the amount of insulin
    * @return {Number} dose - The dose of this insulin bolus
    **/
    getDose(dose) {
        this.dose = dose;
        return this;
    }

}







//ugly way of copying an array
function deep_copy(bg_orig) {
    var bg = bg_orig.map(function (arr) {
        return arr.slice();
    });
    return bg
}









