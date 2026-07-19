const { expect } = require('chai');
const refiner = require('../refiner');

describe('Refiner safety and behavior', function(){
  it('does not mutate input and does not write to Vault during refine', async function(){
    // seed historical snapshots into the refiner's internal vault adapter
    await refiner._internal.seedSnapshot({ trustedData:{ id:'t1', fans:1000, rank:5 }, metadata:{ storedAt: new Date(Date.now()-1000*60*60*24*2).toISOString() } });

    const current = { trustedData:{ id:'t1', fans:1200, rank:5 }, metadata:{ storedAt: new Date().toISOString() } };
    const original = JSON.parse(JSON.stringify(current));

    const res = await refiner.refine(current);
    expect(res).to.be.an('object');
    expect(res.success).to.equal(true);
    // ensure input envelope is not mutated
    expect(current).to.deep.equal(original);
  });

  it('safety override causes vault.store to throw if invoked directly', async function(){
    const vault = refiner._internal.vault;
    let threw = false;
    try{
      await vault.store({});
    }catch(e){
      threw = true;
      expect(e.message).to.match(/Refiner attempted to call Vault/);
    }
    expect(threw).to.equal(true);
  });
});
