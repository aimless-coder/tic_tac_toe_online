const CROSS_CLASS = 'cross';
const CIRCLE_CLASS ='circle';
const WIN_COMBINATION = [
    [0,1,2],
    [3,4,5],
    [6,7,8],
    [0,3,6],
    [1,4,7],
    [2,5,8],
    [0,4,8],
    [2,4,6]
]

const cellEl = document.querySelectorAll('[data-cell]');
const boardEl = document.getElementById('board');
const winMsgEl = document.getElementById('winningMsg');
const winScreenEl = document.querySelector('.winning')
const restartBtnEl = document.getElementById('restart');

let circleTurn;

const placeMark = (cell, currentClass) => {
    cell.classList.add(currentClass);
};

const swapTurn = () =>{
    circleTurn = !circleTurn;
};

const setBoardHover = () => {
    boardEl.classList.remove(CIRCLE_CLASS);
    boardEl.classList.remove(CROSS_CLASS);

    if (circleTurn) {
        boardEl.classList.add(CIRCLE_CLASS);
    }else{
        boardEl.classList.add(CROSS_CLASS);
    }
};

const winCheck = (currentClass) =>{
    return WIN_COMBINATION.some( combination => {
        return combination.every(index => {
            return cellEl[index].classList.contains(currentClass);
        })
    })
};

const isDraw = () => {
    return [...cellEl].every(cell =>{
        return cell.classList.contains(CROSS_CLASS) || cell.classList.contains(CIRCLE_CLASS);
    });
}

const showResult = (draw) =>{
    if (draw) {
        winMsgEl.innerText = 'Draw !!!';
    }else{
        winMsgEl.innerText = `${circleTurn ? "O" : "X"} Wins!!`;
    }
    winScreenEl.classList.add('show');
}

const handleClick = (event) =>{
    const cell = event.target;
    const currentClass = circleTurn ? CIRCLE_CLASS : CROSS_CLASS;

    placeMark(cell, currentClass);

    if(winCheck(currentClass)){
        showResult(isDraw());
    }else{
        swapTurn();
        setBoardHover();
    }

    
};

const startGame = () =>{
    winScreenEl.classList.remove('show');
    circleTurn = false;

    cellEl.forEach(cell => {
        cell.classList.remove(CROSS_CLASS);
        cell.classList.remove(CIRCLE_CLASS);
        
        cell.removeEventListener('click', handleClick);

        cell.addEventListener('click', handleClick, {once: true});
    });

    setBoardHover();
};

restartBtnEl.addEventListener('click', startGame);

startGame();