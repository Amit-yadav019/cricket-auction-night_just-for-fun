// 100 IPL players since 2010. Base prices are custom tiers (0.5/1/1.5/2), not official IPL base prices.
(function () {
  const RAW = {
    BAT: 'Virat Kohli 2,Rohit Sharma 2,AB de Villiers 2,Suryakumar Yadav 2,Shubman Gill 2,Chris Gayle 1.5,David Warner 1.5,Faf du Plessis 1.5,Travis Head 1.5,Shreyas Iyer 1.5,Yashasvi Jaiswal 1.5,Shikhar Dhawan 1.5,Suresh Raina 1.5,Kane Williamson 1.5,Steve Smith 1.5,Ruturaj Gaikwad 1,Ajinkya Rahane 1,Robin Uthappa 1,Ambati Rayudu 1,Devdutt Padikkal 1,Tilak Varma 1,Rinku Singh 1,Rajat Patidar 1,Prithvi Shaw 1,Abhishek Sharma 1,Shimron Hetmyer 1,Manish Pandey 0.5',
    WK: 'MS Dhoni 2,Jos Buttler 2,KL Rahul 2,Rishabh Pant 2,Quinton de Kock 1.5,Sanju Samson 1.5,Ishan Kishan 1.5,Jonny Bairstow 1.5,Heinrich Klaasen 1,Nicholas Pooran 1,Dinesh Karthik 1,Phil Salt 1,Wriddhiman Saha 0.5,Jitesh Sharma 0.5',
    AR: 'Hardik Pandya 2,Ravindra Jadeja 2,Andre Russell 2,Sunil Narine 1.5,Ben Stokes 1.5,Glenn Maxwell 1.5,Shane Watson 1.5,Kieron Pollard 1.5,Dwayne Bravo 1.5,Cameron Green 1.5,Axar Patel 1,Marcus Stoinis 1,Sam Curran 1,Shakib Al Hasan 1,Mitchell Marsh 1,Venkatesh Iyer 1,Shivam Dube 1,Moeen Ali 1,Yusuf Pathan 1,Liam Livingstone 0.5,Krunal Pandya 0.5,Washington Sundar 0.5,Riyan Parag 0.5,Rahul Tewatia 0.5,Nitish Rana 0.5',
    BOWL: 'Jasprit Bumrah 2,Mitchell Starc 2,Rashid Khan 2,Yuzvendra Chahal 1.5,Kagiso Rabada 1.5,Trent Boult 1.5,Mohammed Shami 1.5,Pat Cummins 1.5,Ravichandran Ashwin 1.5,Lasith Malinga 1.5,Josh Hazlewood 1.5,Jofra Archer 1.5,Bhuvneshwar Kumar 1,Kuldeep Yadav 1,Mohammed Siraj 1,Arshdeep Singh 1,Varun Chakravarthy 1,Anrich Nortje 1,Deepak Chahar 1,Shardul Thakur 1,Ravi Bishnoi 1,Mustafizur Rahman 1,Harbhajan Singh 1,Morne Morkel 1,Prasidh Krishna 1,Matheesha Pathirana 1,Dale Steyn 0.5,Harshal Patel 0.5,Amit Mishra 0.5,Umesh Yadav 0.5,Mohit Sharma 0.5,T Natarajan 0.5,Piyush Chawla 0.5,Imran Tahir 0.5'
  };
  window.POOL = [];
  for (const role of Object.keys(RAW)) for (const item of RAW[role].split(',')) {
    const i = item.lastIndexOf(' ');
    window.POOL.push({ name: item.slice(0, i), role, base: Number(item.slice(i + 1)), on: true });
  }
})();
