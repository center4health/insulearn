/* Library to bundle all calculations around blood glucose, insulin and meals for type 1 diabetes
* It provides means to get blood glucose data and manipulate it by adding insulin, meal and other events
*
* This code is designed to explain concepts not to make dosing decisions. We do our best to ensure that all 
* concepts are implemented as close to reality as possible but every body is different.
*
*
*/



base_bg={}

//List of factors influencing bg implemented as functions  
factors=[]



/*
* Apply factor to bg
*
*/
function apply_factor(factor, bg){
    //do some magic here
    return bg
} 

//ugly way of copying an array
function deep_copy_array(bg_orig){
    var bg = bg_orig.map(function(arr) {
        return arr.slice();
    });
    return bg
}

/*
* Returns the bg
*/
export function get_bg(start, end){
    bg=deep_copy_array(base_bg)
    fLen = factors.length;
    for (i = 0; i < fLen; i++) {
        bg=apply_factor(factors[i], bg)
        //apply factor to bg
    }
    return bg
}




const INSULIN_TYPES={name: "RAPID", peak:90, end:300}

class settings={
    isf=2.5, //insulin sensitivity
    cr=10 // carb ratio  0.1= 1:10
}


let data={

}



function add_insulin(time, amount, type){

}

function add_meal(time, carbs, protein, fat){

}

/*
Code copied from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
*/
function insulin_activity(){
    var tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
    var a = 2 * tau / end;                                     // rise time factor
    var S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor
        
    activityContrib = treatment.insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
    iobContrib = treatment.insulin * (1 - S * (1 - a) * ((Math.pow(minsAgo, 2) / (tau * end * (1 - a)) - minsAgo / tau - 1) * Math.exp(-minsAgo / tau) + 1));

}

function calculate_curve(){

}